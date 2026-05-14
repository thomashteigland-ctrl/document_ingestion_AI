# backend/api/health.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/queue/stats")
def queue_stats():
    # Return queue statistics
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    stats = supabase.table("processing_queue")\
        .select("status", count="exact")\
        .execute()
    
    return {"queue_stats": stats.data}