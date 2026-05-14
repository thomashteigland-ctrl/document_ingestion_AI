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
from datetime import datetime, timezone

# --- Utility: Helper Functions ---

class LLMHandler: 
    def __init__(self, supabase_client: Client, organization_id: str, job_id: str, model: str = "deepseek-chat"):
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        if not self.api_key:
            raise RuntimeError("Please set DEEPSEEK_API_KEY environment variable")

        
        self.base_url = "https://api.deepseek.com"
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        self.organization_id = organization_id
        self.supabase_client = supabase_client
        self.job_id = job_id
        self.model = model

        # DeepSeek pricing (per 1M tokens, convert to per token)
        # https://platform.deepseek.com/api-docs/pricing/
        self.input_token_price = 0.28 / 1_000_000  # $0.14 per 1M tokens
        self.output_token_price = 0.42 / 1_000_000  # $0.28 per 1M tokens
        self.cache_hit_price = 0.028 / 1_000_000  # $0.014 per 1M cache hit tokens (90% discount)

    def call_deepseek_chat(self, prompt: str, model: str = "deepseek-chat", temperature: float = 0.0, max_tokens: int = 1000, use_json_mode: bool = False):
        """
        Call DeepSeek API with optional JSON mode.
        
        Args:
            prompt: The prompt to send to the model
            model: Model name (default: deepseek-chat)
            temperature: Temperature for sampling (default: 0.0)
            max_tokens: Maximum tokens to generate (default: 1000)
            use_json_mode: If True, use JSON response format (prompt must mention "json")
        """
        try:
            # Build API call parameters
            params = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            
            # Only add response_format if JSON mode is requested
            # OpenAI requires the prompt to mention "json" when using json_object mode
            if use_json_mode:
                params["response_format"] = {"type": "json_object"}
            
            response = self.client.chat.completions.create(**params)
            
            self.log_token_usage(self.job_id, response)
            return response.choices[0].message.content.strip()

        except Exception as e:
            print(f"API call error: {e}")
            raise

    def classify_document(self, formatted_text: str, document_types: list[str]):
        """
        Classify a document into one of the predefined types.
        Returns the document type name or 'unknown' if no good match.
        """
        # Format document types as numbered list for clarity
        types_list = "\n".join([f"{i+1}. {dt}" for i, dt in enumerate(document_types)])
        
        prompt = f"""Document text:
            {formatted_text[:1000]}

            Instructions:
            Classify this document into ONE of these types:
            {types_list}

            Return ONLY the exact document type name, nothing else."""
        
        # Don't use JSON mode for classification - we want plain text response
        response = self.call_deepseek_chat(prompt, use_json_mode=False)

        if response in document_types:
            return response

        # Fuzzy match with threshold
        match, score = process.extractOne(response, document_types)
        
        # If confidence is high enough (80%+), return the match
        if score >= 80:
            return match
        
        # If still no good match, return unknown
        return "unknown"

    def extract_document_fields(self, formatted_text: str, fields_data: dict):
        """
        Extract specific fields from a document using AI.

        Returns:
            Dict with extracted field values and a mandatory `status` key
        """

        # 🔹 If schema has no fields to extract, return immediately
        if not fields_data.get("fields"):
            return {
                "status": "completed",
                "fields": {}
            }

        # Build field instructions only from 'fields'
        field_instructions = []
        for field_name, samples in fields_data.get("fields", {}).items():
            example_list = []

            if isinstance(samples, (list, tuple)):
                example_list = samples[:10]
            elif isinstance(samples, str):
                example_list = [samples]
            else:
                example_list = []

            if example_list:
                sample_text = f" (examples: {', '.join(map(str, example_list))})"
                field_instructions.append(f"- {field_name}{sample_text}")
            else:
                field_instructions.append(f"- {field_name}")

        fields_str = "\n".join(field_instructions)

        prompt = f"""
            Document text:
            {formatted_text}

            Extract the following fields from this document:

            {fields_str}

            Return your response as a JSON object with exactly these field names.
            Use null for missing fields.
            """

        try:
            response = self.call_deepseek_chat(
                prompt,
                max_tokens=2000,
                use_json_mode=True
            ).strip()

            result = json.loads(response)

            if not isinstance(result, dict):
                raise ValueError(f"Expected JSON object, got {type(result)}")

            # Case-insensitive normalization
            result_lc = {k.lower(): v for k, v in result.items()}

            # Only include keys from the schema fields
            validated_result = {
                f: result_lc.get(f.lower())
                for f in fields_data.get("fields", {})
            }

            missing_fields = any(
                f.lower() not in result_lc for f in fields_data.get("fields", {})
            )

            validated_result["status"] = (
                "needs_review" if missing_fields else "completed"
            )

            return validated_result

        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON response: {e}")
            print(f"Response was: {response}")

        except Exception as e:
            print(f"Error extracting fields: {e}")

        # 🔒 SINGLE SAFE FALLBACK (shared by all failures)
        fallback = {field_name: None for field_name in fields_data.get("fields", {})}
        fallback["status"] = "failed"
        return fallback


    
    def log_token_usage(self, job_id: str, response):
        """Log token usage and cost to database"""
        usage = response.usage
        model = response.model
        
        # Calculate costs
        input_cost = usage.prompt_tokens * self.input_token_price
        output_cost = usage.completion_tokens * self.output_token_price
        
        # Handle cache tokens
        cache_hit_tokens = getattr(usage, 'prompt_cache_hit_tokens', 0) or 0
        cache_creation_tokens = getattr(usage, 'prompt_cache_creation_tokens', 0) or 0
        cache_savings = cache_hit_tokens * (self.input_token_price - self.cache_hit_price)
        
        total_cost = input_cost + output_cost
        
        try:
            self.supabase_client.schema("public").table("llm_calls").insert({
                "job_id": job_id,
                "organization_id": self.organization_id,
                "model": model,
                "input_tokens": usage.prompt_tokens,
                "output_tokens": usage.completion_tokens,
                "cache_hit_tokens": cache_hit_tokens,
                "cache_creation_tokens": cache_creation_tokens,
                "cost": float(total_cost),
                "cache_savings": float(cache_savings),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }).execute()
        except Exception as e:
            print(f"Failed to log LLM usage: {e}")


