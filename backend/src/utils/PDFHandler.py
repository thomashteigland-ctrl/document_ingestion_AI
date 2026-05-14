import pdfplumber
import tempfile
import os
import requests
from openai import OpenAI
from supabase import create_client, Client
import json
from fuzzywuzzy import process
import json
import re
import pandas as pd


# --- Utility: Helper Functions ---
class PDFHandler: 
    def __init__(self, path: str):
        self.path = path
    
    def reconstruct_text_for_llm(self, words_json, y_tolerance=10, space_threshold=15, use_separator=True):
        """
        Reconstructs text from OCR/parsed PDF data in a layout-preserving but LLM-friendly way.
        - Keeps natural layout for textual sections
        - Adds horizontal dividers between vertical gaps
        - Lightly aligns tabular/numeric lines for readability
        """

        # --- Sort words vertically and horizontally ---
        words_sorted = sorted(words_json, key=lambda w: (w["top"], w["x0"]))

        # --- Group words into lines ---
        lines = []
        current_line = []
        last_y = None
        for word in words_sorted:
            if last_y is None or abs(word["top"] - last_y) <= y_tolerance:
                current_line.append(word)
            else:
                lines.append(sorted(current_line, key=lambda w: w["x0"]))
                current_line = [word]
            last_y = word["top"]
        if current_line:
            lines.append(sorted(current_line, key=lambda w: w["x0"]))

        # --- Build each line with spacing ---
        text_lines = []
        prev_line_bottom = None

        for line in lines:
            line_top = min(w["top"] for w in line)
            if prev_line_bottom is not None and (line_top - prev_line_bottom) > (2 * y_tolerance):
                # Add divider for large vertical gaps
                text_lines.append("\n" + "-" * 80 + "\n")

            line_text = []
            prev_right = None

            for word in line:
                if prev_right is not None:
                    gap = word["x0"] - prev_right
                    if gap > space_threshold:
                        if use_separator and gap > 2 * space_threshold:
                            line_text.append(" | ")
                        else:
                            line_text.append("  ")
                    else:
                        line_text.append(" ")
                line_text.append(word["text"])
                prev_right = word.get("x1", word["x0"] + 10)

            text_lines.append("".join(line_text))
            prev_line_bottom = max(w["top"] for w in line)

        # --- Light normalization pass ---
        def clean_layout_for_llm(lines):
            cleaned = []
            for line in lines:
                # Collapse multiple spaces
                line = " ".join(line.split())

                # Normalize separators
                line = line.replace(" |", "|").replace("| ", "|").replace("|", " | ")

                # Detect tabular/numeric lines
                has_numbers = any(ch.isdigit() for ch in line)
                has_pipes = "|" in line
                if has_numbers and (has_pipes or len(line.split()) > 5):
                    # Lightly pad for pseudo-columns
                    parts = [p.strip() for p in line.split("|")]
                    line = " | ".join(p.ljust(25) for p in parts)
                cleaned.append(line)
            return cleaned

        text_lines = clean_layout_for_llm(text_lines)
        return "\n".join(text_lines)

    def extract_pdf_with_layout(self, page_num=0):
        """
        Extract PDF with layout preservation for LLM processing.
        Adds minimal metadata wrapper without assuming document type.
        """
        print(1)
        pdf = pdfplumber.open(self.path)
        print(2)
        words = pdf.pages[page_num].extract_words()
        print(3)
        
        # TODO: Add OCR to words
        
        formatted_text = self.reconstruct_text_for_llm(words)
        
        pdf.close()
        return formatted_text