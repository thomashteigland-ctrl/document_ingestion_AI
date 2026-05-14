import pandas as pd
from openai import OpenAI
import Path
import pdfplumber

DEEPSEEK_API_KEY = "sk-22075a23b9844efb83373bf08512dea0"
BASE = "https://api.deepseek.com"


client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")

class PDF_Reader():
    
    def __init__(self):
        pass

    def extract_text(self, file_path):
        with open(file_path, 'rb') as file:
            pdf = pdftotext.PDF(file)
        text = "\n\n".join(pdf)
        return text