from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import uuid
import shutil
from pathlib import Path
from typing import List, Dict, Any
import asyncio
from datetime import datetime

# Import our PDF processor
from pdf_processor import process_pdf

# Import schema API
from schema_api import router as schema_router

app = FastAPI(title="PDF Processing API", version="1.0.0")

# Include schema API router
app.include_router(schema_router)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories
UPLOAD_DIR = Path("uploads")
RESULTS_DIR = Path("results")
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

# In-memory store for job status (use Redis in production)
jobs: Dict[str, Dict[str, Any]] = {}

@app.get("/")
async def root():
    return {"message": "PDF Processing API is running"}

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """Upload PDF files and start processing"""
    job_id = str(uuid.uuid4())
    
    # Validate files
    for file in files:
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail=f"File {file.filename} is not a PDF")
        if file.size > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(status_code=400, detail=f"File {file.filename} is too large")
    
    # Save files and create job
    uploaded_files = []
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(exist_ok=True)
    
    for file in files:
        file_path = job_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        uploaded_files.append({
            "filename": file.filename,
            "size": file.size,
            "path": str(file_path)
        })
    
    # Initialize job status
    jobs[job_id] = {
        "id": job_id,
        "status": "uploaded",
        "files": uploaded_files,
        "created_at": datetime.now().isoformat(),
        "progress": 0,
        "results": None,
        "error": None
    }
    
    # Start processing in background
    asyncio.create_task(process_files_background(job_id))
    
    return {"job_id": job_id, "message": f"Uploaded {len(files)} files", "files": uploaded_files}

@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Get job processing status"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return jobs[job_id]

@app.get("/results/{job_id}")
async def get_results(job_id: str):
    """Get processing results"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job status: {job['status']}")
    
    return job["results"]

@app.delete("/job/{job_id}")
async def cleanup_job(job_id: str):
    """Clean up job files and data"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Remove files
    job_dir = UPLOAD_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
    
    # Remove job data
    del jobs[job_id]
    
    return {"message": "Job cleaned up successfully"}

async def process_files_background(job_id: str):
    """Background task to process PDF files"""
    job = jobs[job_id]
    
    try:
        job["status"] = "processing"
        job["progress"] = 10
        
        results = []
        total_files = len(job["files"])
        
        for i, file_info in enumerate(job["files"]):
            job["progress"] = 10 + (i * 80 // total_files)  # 10-90% for processing
            
            # Process the PDF
            result = await asyncio.to_thread(process_pdf, file_info["path"])
            results.append({
                "filename": file_info["filename"],
                "result": result
            })
        
        job["status"] = "completed"
        job["progress"] = 100
        job["results"] = results
        job["completed_at"] = datetime.now().isoformat()
        
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["failed_at"] = datetime.now().isoformat()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)