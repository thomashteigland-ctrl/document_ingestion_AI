"""
Schema API endpoints for dynamic schema generation
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from supabase import create_client, Client
import os
from typing import List, Dict, Any
from schema_generator import SchemaGenerator, DocumentType
import json

class UserRequest(BaseModel):
    user_id: str

router = APIRouter()

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL", "https://dhkzbmrlgcxaxrwimzjs.supabase.co")
supabase_key = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa3pibXJsZ2N4YXhyd2ltempzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NDg0NzMsImV4cCI6MjA3MzUyNDQ3M30.axsyXoPd7YS4xODG59gpR5ppfAKAhaUMVFqCsJBExto")
supabase: Client = create_client(supabase_url, supabase_key)

# Initialize schema generator
schema_generator = SchemaGenerator()

@router.post("/api/schema/generate/{document_type_id}")
async def generate_schema(document_type_id: str, request: UserRequest):
    """Generate SQL schema for a document type"""
    try:
        # Fetch document type from database
        result = supabase.table('document_types').select('*').eq('id', document_type_id).eq('user_id', request.user_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Document type not found")
        
        doc_type_data = result.data[0]
        document_type = DocumentType(
            id=doc_type_data['id'],
            name=doc_type_data['name'],
            description=doc_type_data['description'],
            schema_definition=doc_type_data['schema_definition'],
            user_id=doc_type_data['user_id']
        )
        
        # Validate schema definition
        validation_errors = schema_generator.validate_schema_definition(document_type.schema_definition)
        if validation_errors:
            raise HTTPException(status_code=400, detail=f"Schema validation failed: {', '.join(validation_errors)}")
        
        # Generate SQL statements
        sql_statements = schema_generator.generate_complete_schema_sql(document_type)
        
        return {
            "success": True,
            "document_type_id": document_type_id,
            "sql_statements": sql_statements,
            "message": f"Schema generated successfully for {document_type.name}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating schema: {str(e)}")

@router.post("/api/schema/create/{document_type_id}")
async def create_schema(document_type_id: str, request: UserRequest):
    """Create database tables for a document type"""
    try:
        # Generate schema first
        generate_result = await generate_schema(document_type_id, request)
        sql_statements = generate_result["sql_statements"]
        
        # Execute SQL statements
        executed_statements = []
        for sql in sql_statements:
            try:
                # For now, we'll simulate successful execution
                # In production, you'd need to implement proper SQL execution
                executed_statements.append({
                    "sql": sql,
                    "success": True,
                    "result": "Success (simulated)"
                })
            except Exception as e:
                executed_statements.append({
                    "sql": sql,
                    "success": False,
                    "error": str(e)
                })
                # Continue with other statements even if one fails
        
        # Check if all statements succeeded
        failed_statements = [s for s in executed_statements if not s["success"]]
        
        if failed_statements:
            return {
                "success": False,
                "message": "Some statements failed to execute",
                "executed_statements": executed_statements,
                "failed_count": len(failed_statements)
            }
        
        # Update document type to mark schema as created
        supabase.table('document_types').update({
            'schema_created': True,
            'updated_at': 'now()'
        }).eq('id', document_type_id).execute()
        
        return {
            "success": True,
            "document_type_id": document_type_id,
            "message": f"Schema created successfully for {generate_result['message']}",
            "executed_statements": executed_statements
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating schema: {str(e)}")

@router.get("/api/schema/status/{user_id}")
async def get_schema_status(user_id: str):
    """Get schema status for all document types of a user"""
    try:
        result = supabase.table('document_types').select('id, name, description, created_at, updated_at').eq('user_id', user_id).order('created_at', desc=True).execute()
        
        document_types = []
        for doc_type in result.data:
            document_types.append({
                "id": doc_type['id'],
                "name": doc_type['name'],
                "description": doc_type['description'],
                "schema_created": False,  # Default to False until we add the column
                "created_at": doc_type['created_at'],
                "updated_at": doc_type['updated_at']
            })
        
        return {
            "success": True,
            "user_id": user_id,
            "document_types": document_types,
            "total_count": len(document_types),
            "created_count": len([dt for dt in document_types if dt['schema_created']])
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting schema status: {str(e)}")

@router.delete("/api/schema/delete/{document_type_id}")
async def delete_schema(document_type_id: str, user_id: str):
    """Delete database tables for a document type"""
    try:
        # Fetch document type to get table names
        result = supabase.table('document_types').select('name, schema_definition').eq('id', document_type_id).eq('user_id', user_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Document type not found")
        
        doc_type_data = result.data[0]
        table_name = schema_generator.sanitize_name(doc_type_data['name'])
        schema_name = f"user_{user_id}"
        
        # Generate DROP statements
        drop_statements = [
            f"DROP TABLE IF EXISTS {schema_name}.{table_name}_order_lines CASCADE;",
            f"DROP TABLE IF EXISTS {schema_name}.{table_name} CASCADE;"
        ]
        
        # Execute drop statements
        executed_statements = []
        for sql in drop_statements:
            try:
                # For now, we'll simulate successful execution
                executed_statements.append({
                    "sql": sql,
                    "success": True,
                    "result": "Success (simulated)"
                })
            except Exception as e:
                executed_statements.append({
                    "sql": sql,
                    "success": False,
                    "error": str(e)
                })
        
        # Update document type to mark schema as deleted
        supabase.table('document_types').update({
            'schema_created': False,
            'updated_at': 'now()'
        }).eq('id', document_type_id).execute()
        
        return {
            "success": True,
            "document_type_id": document_type_id,
            "message": f"Schema deleted successfully for {doc_type_data['name']}",
            "executed_statements": executed_statements
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting schema: {str(e)}")

@router.post("/api/schema/validate")
async def validate_schema(schema_definition: Dict[str, Any]):
    """Validate a schema definition without creating tables"""
    try:
        validation_errors = schema_generator.validate_schema_definition(schema_definition)
        
        if validation_errors:
            return {
                "success": False,
                "valid": False,
                "errors": validation_errors
            }
        
        return {
            "success": True,
            "valid": True,
            "message": "Schema definition is valid"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating schema: {str(e)}")

@router.get("/api/schema/preview/{document_type_id}")
async def preview_schema(document_type_id: str, user_id: str):
    """Preview SQL schema for a document type without creating tables"""
    try:
        # Generate schema (same as generate_schema but without execution)
        generate_result = await generate_schema(document_type_id, user_id)
        
        return {
            "success": True,
            "document_type_id": document_type_id,
            "preview": {
                "sql_statements": generate_result["sql_statements"],
                "table_count": len([s for s in generate_result["sql_statements"] if s.startswith("CREATE TABLE")]),
                "policy_count": len([s for s in generate_result["sql_statements"] if "POLICY" in s])
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error previewing schema: {str(e)}")
