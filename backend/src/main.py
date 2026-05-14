# --- Imports ---
import time
from datetime import datetime
from dotenv import load_dotenv
import pdfplumber
import tempfile
import os
import requests
from openai import OpenAI
from supabase import create_client, Client
from fuzzywuzzy import process
import json
import re
import pandas as pd
import traceback

# Import your handlers
from utils.PDFHandler import PDFHandler
from utils.LLMHandler import LLMHandler


# --- Supabase Connection ---
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("✅ Connected to Supabase")


# --- Utility: Helper Functions ---
def get_next_pending_job():
    """Fetch one pending or failed job for testing."""
    res = supabase.table("processing_queue") \
        .select("*") \
        .in_("status", ["pending"]) \
        .order("created_at", desc=False) \
        .limit(1) \
        .execute()
    return res.data[0] if res.data else None

def update_job_status(job_id, status: str):
    """Update the status of a queue job."""
    supabase.table("processing_queue").update({
        "status": status,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", job_id).execute()
    print(f"🔁 Job {job_id} → {status}")

def download_file_from_storage(file_path: str, bucket_name: str = "documents"):
    """Download a file from Supabase Storage to a temporary location."""
    try:
        # Download the file from storage
        file_data = supabase.storage.from_(bucket_name).download(file_path)
        
        # Create a temporary file
        suffix = os.path.splitext(file_path)[1]  # Get file extension
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_file.write(file_data)
        temp_file.close()
        
        return temp_file.name
    except Exception as e:
        print(f"❌ Error downloading file from storage: {e}")
        raise

def get_document_types(organization_id: str):
    response = (
        supabase
        .table("document_types")
        .select("id, name")
        .eq("organization_id", organization_id)
        .execute()
    )
    return {row["name"]: row["id"] for row in response.data}

def get_schema_definition(organization_id: str, document_type: str):
    schema_definition_response = supabase.schema("public").table("document_types").select("schema_definition").eq("organization_id", organization_id).eq("name", document_type).execute()
    return schema_definition_response.data[0]["schema_definition"]

def insert_document_information(
    extraction_result: dict, 
    job: dict,
    document_type: str,
    supabase_client,
    organization_id: str ):
    """
    Insert extracted data into organization schema tables with status tracking.
    
    Args:
        extraction_result: Result from extract_document_fields
        job: The processing queue job dict containing file info
        document_type: The classified document type
        supabase_client: Supabase client instance
        organization_id: The organization ID
        
    Returns:
        Dict with insertion results including status
    """
    try:
        # Get the organization schema name
        schema_name = f"organization_{organization_id.replace('-', '_')}"
        
        # Extract file name from file path
        file_name = job['file_path'].split('/')[-1]
        
        # Prepare document-level data
        doc_data = extraction_result["document_data"].copy()
        
        # Add required schema fields
        doc_data["id"] = job["document_id"]  # Use the document_id from processing_queue
        doc_data["user_id"] = job["user_id"]  # Required by schema
        doc_data["file_name"] = file_name  # Required by schema
        doc_data["file_path"] = job["file_path"]  # Required by schema
        doc_data["document_type"] = document_type  # What type of document this is
        
        # Map extraction status to document status
        if extraction_result["status"] == "completed" or extraction_result["status"] == "needs_review":
            doc_data["status"] = "completed"
        
        # Add metadata fields
        doc_data["needs_manual_review"] = extraction_result["needs_manual_review"]
        
        # Insert into the organization-specific documents table
        doc_response = supabase_client.schema("public").table("documents").upsert(doc_data).execute()
        
        # Insert order lines if present
        order_lines_inserted = 0
        if extraction_result["order_lines"]:
            order_lines_df = extraction_result["order_lines_df"].copy()
            
            # Add document_id to each order line
            order_lines_df["document_id"] = job["document_id"]
            
            # Convert DataFrame to list of dicts for insertion
            order_lines_records = order_lines_df.to_dict('records')
            
            # Insert into the organization-specific order_lines table
            lines_response = supabase_client.schema(schema_name).table("order_lines").insert(order_lines_records).execute()
            order_lines_inserted = len(order_lines_records)
        
        return {
            "status": extraction_result["status"],
            "order_lines_inserted": order_lines_inserted,
            "needs_manual_review": extraction_result["needs_manual_review"],
            "extraction_summary": {
                "extracted_fields": len(extraction_result["extraction_status"]["extracted_fields"]),
                "missing_required_fields": len(extraction_result["extraction_status"]["missing_required_fields"]),
                "order_lines": order_lines_inserted
            }
        }
        
    except Exception as e:
        print(f"Error inserting to Supabase: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "status": "failed",
            "needs_manual_review": True
        }

# --- Main Processing Functions ---
def process_job(job):
    """Main processing function."""

    job_id = job["id"]
    organization_id = job["organization_id"]

    print(f"⚙️  Processing document: {job['file_path']}")
    update_job_status(job["id"], "processing")

    llm = LLMHandler(supabase, organization_id, job_id)

    # Here you’d call your actual processing pipeline
    try:
        # Download file from Supabase Storage
        print(f"📥 Downloading file from storage...")
        temp_file_path = download_file_from_storage(job["file_path"])
        pdf = PDFHandler(temp_file_path)
        
        # Ingest PDF using PDFPlumber
        print(f"📄 Processing PDF...")
        formatted_text = pdf.extract_pdf_with_layout()
        document_types = get_document_types(job["organization_id"])

        # Classify document
        document_type = llm.classify_document(formatted_text, document_types.keys())
        document_type_id = document_types[document_type] if document_type != "unknown" else None

        if document_type_id:
            schema_definition = get_schema_definition(job["organization_id"], document_type)
            print(f"✅ Schema definition: {schema_definition}")
            print()
            doc_info = llm.extract_document_fields(formatted_text, schema_definition)
            print(f"✅ Doc info: {doc_info}")
            print()
        else:
            doc_info = None

        if doc_info:
            status = doc_info.get("status", "completed")
            extracted_values = { k: v for k, v in doc_info.items() if k != "status"}
        else:
            status = "needs_review"
            extracted_values = None

        payload = {
            "job_id": job_id,
            "user_id": job["user_id"],
            "organization_id": organization_id,
            "document_type_id": document_type_id,
            "file_name": job["file_name"],
            "file_path": job["file_path"],
            "status": status,
            "extracted_values": extracted_values,
        }

        # Insert document information into supabase and finish job in processing queue
        supabase.schema("public").table("documents").insert(payload).execute() 
        update_job_status(job["id"], "completed")

        # TODO: Insert document metadata into supabase
        # TODO: Insert order lines into supabase

    except Exception as e:
        print("--------------------------------")
        print(f"❌ Error processing job {job['id']}: {e}")
        update_job_status(job["id"], "failed")
        traceback.print_exc()
        print("--------------------------------")
    # Clean up temporary file
    finally:
        try:  
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                print(f"🧹 Cleaned up temporary file")
        except (NameError, Exception) as e:
            # temp_file_path might not be defined if download failed
            pass

def worker_loop():
    """Simple loop to continuously check for new jobs."""
    print("👷 Worker started...")
    while True:
        job = get_next_pending_job()
        if job:
            process_job(job)
        else:
            print("⏸️  No pending jobs. Sleeping...")
            time.sleep(5)

def test_connection():
    """Test the connection to the database."""
    # Get the first job in the processing queue
    while True:
        job = get_next_pending_job()
        if job:
            organization_id = job["organization_id"]
            document_types = get_document_types(organization_id)
            print(f"✅ Document types: {document_types}")
        else:
            print("⏸️  No pending jobs. Sleeping...")
            time.sleep(3)



if __name__ == "__main__":
    worker_loop()
    # test_connection()
    


