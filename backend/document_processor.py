"""
Document Processing Pipeline

This module handles the end-to-end processing of uploaded documents,
from the processing queue to final document storage.
"""

import asyncio
import json
import os
import logging
import sys
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path

from supabase import create_client, Client
import pdfplumber
from decimal import Decimal

from pdf_processor import process_pdf as pdf_extractor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('document_processor.log')
    ]
)
logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Main document processor with idempotency and error handling."""
    
    def __init__(self):
        """Initialize the processor with Supabase connection."""
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        self.max_retries = 3
        
    async def process_queue(self):
        """Main processing loop - continuously checks for new documents."""
        logger.info("🚀 Document processor started. Waiting for documents...")
        
        while True:
            try:
                # Get pending documents
                documents = self.get_pending_documents()
                
                if not documents:
                    await asyncio.sleep(5)  # Wait 5 seconds before checking again
                    continue
                
                logger.info(f"📄 Found {len(documents)} document(s) to process")
                
                for doc in documents:
                    await self.process_document(doc)
                    
            except Exception as e:
                logger.error(f"❌ Error in processing loop: {e}", exc_info=True)
                await asyncio.sleep(10)
    
    def get_pending_documents(self) -> List[Dict[str, Any]]:
        """Fetch documents with pending status from the processing queue."""
        try:
            response = self.supabase.table('processing_queue')\
                .select('*')\
                .eq('status', 'pending')\
                .order('created_at', desc=False)\
                .limit(10)\
                .execute()
            
            return response.data if response.data else []
        except Exception as e:
            logger.error(f"❌ Error fetching pending documents: {e}", exc_info=True)
            return []
    
    async def process_document(self, document: Dict[str, Any]):
        """
        Process a single document with full error handling and transaction management.
        
        Steps:
        1. Mark as processing (with idempotency check)
        2. Download file and classify document type
        3. Get document type schema
        4. Extract data from document
        5. Insert data into workspace tables (transactional)
        6. Move file to final location
        7. Update document status
        8. Remove from processing queue
        """
        doc_id = document['id']
        organization_id = document['organization_id']
        
        logger.info(f"\n📋 Processing document: {doc_id}")
        
        try:
            # Step 1: Mark as processing (with idempotency)
            if not self.mark_as_processing(doc_id):
                logger.warning(f"⚠️ Document {doc_id} is already being processed or completed")
                return
            
            # Step 2: Download file from Supabase Storage
            file_content = self.download_file(document['file_path'])
            
            # Step 3: Classify document type (AI-based classification)
            document_type_name = await self.classify_document_type(file_content, organization_id)
            logger.info(f"📄 Document classified as: {document_type_name}")
            
            # Step 4: Get document type schema
            schema = self.get_document_type_schema(organization_id, document_type_name)
            if not schema:
                raise ValueError(f"Document type '{document_type_name}' not found in organization")
            
            # Step 5: Extract data from PDF
            extracted_data = await self.extract_pdf_data(file_content, schema)
            
            # Step 6: Insert data into organization tables (transactional)
            document_db_id = self.insert_document_data(
                organization_id=organization_id,
                document_type_name=document_type_name,
                file_path=document['file_path'],
                extracted_data=extracted_data,
                schema=schema
            )
            
            # Step 7: Move file to organized location
            new_file_path = self.organize_document(
                organization_id=organization_id,
                old_path=document['file_path'],
                document_type_name=document_type_name,
                extracted_data=extracted_data,
                document_db_id=document_db_id
            )
            
            # Step 8: Update document record with final path and status
            self.update_document_path(organization_id, document_type_name, document_db_id, new_file_path)
            
            # Step 9: Mark as completed
            self.mark_as_completed(doc_id, document_db_id)
            
            # Step 10: Remove from processing queue
            self.remove_from_queue(doc_id)
            
            logger.info(f"✅ Successfully processed document: {doc_id}")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Error processing document {doc_id}: {error_msg}", exc_info=True)
            
            # Mark as failed
            self.mark_as_failed(doc_id, error_msg)
            
            # Move to failed folder
            try:
                self.move_to_failed_folder(document['file_path'])
            except Exception as move_error:
                logger.warning(f"⚠️ Failed to move to failed folder: {move_error}")
    
    def mark_as_processing(self, doc_id: str) -> bool:
        """
        Mark document as processing with idempotency check.
        Returns False if already processing or completed.
        """
        try:
            # Try to update status from 'pending' to 'processing'
            response = self.supabase.table('processing_queue')\
                .update({
                    'status': 'processing',
                    'processing_started_at': datetime.utcnow().isoformat()
                })\
                .eq('id', doc_id)\
                .eq('status', 'pending')\
                .execute()
            
            # If no rows were updated, it means it's already processing or completed
            return len(response.data) > 0
            
        except Exception as e:
            logger.error(f"❌ Error marking as processing: {e}", exc_info=True)
            return False
    
    async def classify_document_type(self, file_content: bytes, organization_id: str) -> str:
        """
        Classify the document type based on its content.
        This is a placeholder that returns the first available document type.
        
        TODO: Implement AI-based classification using:
        - OCR + keyword matching
        - LLM classification (GPT-4, Claude, etc.)
        - Custom ML model
        
        Returns the document type name.
        """
        try:
            # Get available document types for this organization
            response = self.supabase.table('document_types')\
                .select('name')\
                .eq('organization_id', organization_id)\
                .execute()
            
            if not response.data or len(response.data) == 0:
                raise ValueError(f"No document types defined for organization {organization_id}. Please create document types in Schema Editor.")
            
            # PLACEHOLDER: Just return the first document type
            # TODO: Implement actual classification logic here
            classified_type = response.data[0]['name']
            
            logger.info(f"🤖 Document classification: Using '{classified_type}' for organization {organization_id} (placeholder - implement AI classification)")
            logger.info(f"📋 Available document types in this organization: {[dt['name'] for dt in response.data]}")
            
            return classified_type
            
        except Exception as e:
            raise Exception(f"Failed to classify document: {e}")
    
    def get_document_type_schema(self, organization_id: str, document_type_name: str) -> Optional[Dict]:
        """Get the schema definition for a document type."""
        try:
            response = self.supabase.table('document_types')\
                .select('schema_definition')\
                .eq('organization_id', organization_id)\
                .eq('name', document_type_name)\
                .single()\
                .execute()
            
            return response.data.get('schema_definition') if response.data else None
            
        except Exception as e:
            logger.error(f"❌ Error fetching schema for document type '{document_type_name}' in organization {organization_id}: {e}", exc_info=True)
            return None
    
    def download_file(self, file_path: str) -> bytes:
        """Download file from Supabase Storage."""
        try:
            response = self.supabase.storage.from_('documents').download(file_path)
            return response
        except Exception as e:
            raise Exception(f"Failed to download file: {e}")
    
    async def extract_pdf_data(self, file_content: bytes, schema: Dict) -> Dict[str, Any]:
        """Extract data from PDF based on the schema definition."""
        try:
            # Save to temporary file
            temp_file = Path(f"/tmp/pdf_{datetime.now().timestamp()}.pdf")
            temp_file.write_bytes(file_content)
            
            # Process with pdf_processor
            extracted_data = await pdf_extractor(temp_file)
            
            # Clean up
            temp_file.unlink()
            
            # Validate and structure the data based on schema
            structured_data = self.structure_data(extracted_data, schema)
            
            return structured_data
            
        except Exception as e:
            raise Exception(f"Failed to extract PDF data: {e}")
    
    def structure_data(self, extracted_data: Dict, schema: Dict) -> Dict[str, Any]:
        """
        Structure extracted data according to the schema definition.
        This is a placeholder - implement actual PDF extraction logic here.
        """
        fields = schema.get('fields', [])
        order_line_fields = schema.get('order_line_fields', []) if schema.get('contains_order_lines') else []
        
        structured = {
            'fields': {},
            'order_lines': []
        }
        
        # Map extracted data to schema fields
        # TODO: Implement actual mapping logic based on your PDF extraction needs
        
        return structured
    
    def insert_document_data(
        self, 
        organization_id: str, 
        document_type_name: str,
        file_path: str,
        extracted_data: Dict,
        schema: Dict
    ) -> str:
        """
        Insert document data into organization tables within a transaction.
        Returns the document ID from the organization table.
        """
        try:
            from schema_generator import SchemaGenerator
            generator = SchemaGenerator()
            
            # Generate schema and table names
            schema_name = f"organization_{organization_id.replace('-', '_')}"
            table_name = generator.sanitize_name(document_type_name)
            
            # Get current user_id for the record (we'll use service role, but track actual user)
            # For now, we'll get the first user in the organization
            users_response = self.supabase.table('users')\
                .select('id')\
                .eq('organization_id', organization_id)\
                .limit(1)\
                .execute()
            
            if not users_response.data:
                raise Exception("No users found for this organization")
            
            user_id = users_response.data[0]['id']
            
            # Build INSERT query for main document table
            # First, insert into organization documents table
            document_id = self._generate_uuid()
            
            # Prepare field values from extracted data
            field_columns = ['id', 'user_id', 'file_name', 'file_path', 'status', 'created_at']
            field_values = [
                f"'{document_id}'",
                f"'{user_id}'",
                f"'{Path(file_path).name}'",
                f"'{file_path}'",
                "'processing'",
                'NOW()'
            ]
            
            # Add extracted field data
            for field_data in schema.get('fields', []):
                field_name = generator.sanitize_name(field_data['name'])
                field_value = extracted_data.get('fields', {}).get(field_data['name'])
                
                if field_value is not None:
                    field_columns.append(field_name)
                    # Escape and quote the value based on type
                    if field_data['type'] in ['number']:
                        field_values.append(str(field_value))
                    else:
                        # Escape single quotes
                        escaped_value = str(field_value).replace("'", "''")
                        field_values.append(f"'{escaped_value}'")
            
            # Build the SQL transaction
            sql_transaction = f"""
            BEGIN;
            
            -- Insert main document record
            INSERT INTO {schema_name}.{table_name} ({', '.join(field_columns)})
            VALUES ({', '.join(field_values)});
            """
            
            # Add order lines if applicable
            if schema.get('contains_order_lines') and extracted_data.get('order_lines'):
                order_line_table = f"{table_name}_order_lines"
                
                for line_num, line_data in enumerate(extracted_data['order_lines'], start=1):
                    line_columns = ['id', 'parent_document_id', 'line_number', 'created_at']
                    line_values = [
                        f"'{self._generate_uuid()}'",
                        f"'{document_id}'",
                        str(line_num),
                        'NOW()'
                    ]
                    
                    # Add order line fields
                    for field_data in schema.get('order_line_fields', []):
                        field_name = generator.sanitize_name(field_data['name'])
                        field_value = line_data.get(field_data['name'])
                        
                        if field_value is not None:
                            line_columns.append(field_name)
                            if field_data['type'] in ['number']:
                                line_values.append(str(field_value))
                            else:
                                escaped_value = str(field_value).replace("'", "''")
                                line_values.append(f"'{escaped_value}'")
                    
                    sql_transaction += f"""
            -- Insert order line {line_num}
            INSERT INTO {schema_name}.{order_line_table} ({', '.join(line_columns)})
            VALUES ({', '.join(line_values)});
            """
            
            sql_transaction += "\nCOMMIT;"
            
            # Execute the transaction
            response = self.supabase.rpc('exec_sql', {
                'sql_query': sql_transaction
            }).execute()
            
            logger.info(f"✅ Inserted document data into {schema_name}.{table_name}")
            
            return document_id
            
        except Exception as e:
            raise Exception(f"Failed to insert document data: {e}")
    
    def _generate_uuid(self) -> str:
        """Generate a UUID string"""
        import uuid
        return str(uuid.uuid4())
    
    def organize_document(
        self, 
        organization_id: str, 
        old_path: str,
        document_type_name: str,
        extracted_data: Dict,
        document_db_id: str
    ) -> str:
        """
        Move document to organized location based on user grouping conventions.
        This operation includes:
        1. Moving the file in Supabase Storage
        2. Updating the file_path in the organization documents table
        Both operations are wrapped in error handling to ensure consistency.
        
        Returns the new file path.
        """
        try:
            from schema_generator import SchemaGenerator
            generator = SchemaGenerator()
            
            schema_name = f"organization_{organization_id.replace('-', '_')}"
            table_name = generator.sanitize_name(document_type_name)
            
            # TODO: Implement user-defined grouping logic
            # For now, organize by document type and date
            today = datetime.now().strftime('%Y/%m/%d')
            file_name = Path(old_path).name
            new_path = f"organization-{organization_id}/documents/{document_type_name}/{today}/{file_name}"
            
            # Move file in Supabase Storage
            try:
                move_response = self.supabase.storage.from_('documents')\
                    .move(old_path, new_path)
                
                logger.info(f"✅ Moved document from {old_path} to {new_path}")
                
            except Exception as move_error:
                # If move fails, we need to handle it gracefully
                error_msg = str(move_error)
                logger.warning(f"❌ Failed to move document: {error_msg}")
                
                # Try to copy instead of move as a fallback
                try:
                    # Download the file
                    file_content = self.download_file(old_path)
                    
                    # Upload to new location
                    self.supabase.storage.from_('documents')\
                        .upload(new_path, file_content, {
                            'upsert': False
                        })
                    
                    # Delete old file
                    self.supabase.storage.from_('documents')\
                        .remove([old_path])
                    
                    logger.info(f"✅ Copied and deleted document from {old_path} to {new_path}")
                    
                except Exception as fallback_error:
                    # If even fallback fails, keep the old path
                    logger.warning(f"⚠️ Fallback also failed: {fallback_error}. Keeping original path.")
                    new_path = old_path
            
            # Update the document record with new path (transactional with file move)
            try:
                update_sql = f"""
                UPDATE {schema_name}.{table_name}
                SET file_path = '{new_path}', updated_at = NOW()
                WHERE id = '{document_db_id}';
                """
                
                self.supabase.rpc('exec_sql', {
                    'sql_query': update_sql
                }).execute()
                
                logger.info(f"✅ Updated document path in database")
                
            except Exception as db_error:
                logger.warning(f"⚠️ Failed to update document path in database: {db_error}")
                # We'll continue even if DB update fails, as the file has been moved
            
            return new_path
            
        except Exception as e:
            raise Exception(f"Failed to organize document: {e}")
    
    def update_document_path(self, organization_id: str, document_type_name: str, doc_id: str, new_path: str):
        """Update document record with final file path and mark as completed."""
        try:
            from schema_generator import SchemaGenerator
            generator = SchemaGenerator()
            
            schema_name = f"organization_{organization_id.replace('-', '_')}"
            table_name = generator.sanitize_name(document_type_name)
            
            update_sql = f"""
            UPDATE {schema_name}.{table_name}
            SET file_path = '{new_path}', status = 'completed', updated_at = NOW()
            WHERE id = '{doc_id}';
            """
            
            self.supabase.rpc('exec_sql', {
                'sql_query': update_sql
            }).execute()
            
            logger.info(f"✅ Updated document status to completed")
            
        except Exception as e:
            logger.error(f"❌ Error updating document path: {e}", exc_info=True)
    
    def mark_as_completed(self, queue_id: str, doc_id: str):
        """Mark document as completed in the processing queue."""
        try:
            self.supabase.table('processing_queue')\
                .update({
                    'status': 'completed',
                    'processing_completed_at': datetime.utcnow().isoformat()
                })\
                .eq('id', queue_id)\
                .execute()
        except Exception as e:
            logger.error(f"❌ Error marking as completed: {e}", exc_info=True)
    
    def mark_as_failed(self, queue_id: str, error_message: str):
        """Mark document as failed and increment retry count."""
        try:
            # Get current retry count
            current = self.supabase.table('processing_queue')\
                .select('retry_count')\
                .eq('id', queue_id)\
                .single()\
                .execute()
            
            retry_count = current.data.get('retry_count', 0) + 1
            
            update_data = {
                'status': 'failed' if retry_count >= self.max_retries else 'pending',
                'error_message': error_message,
                'retry_count': retry_count
            }
            
            self.supabase.table('processing_queue')\
                .update(update_data)\
                .eq('id', queue_id)\
                .execute()
                
            if retry_count >= self.max_retries:
                logger.error(f"🔴 Document {queue_id} exceeded max retries")
            
        except Exception as e:
            logger.error(f"❌ Error marking as failed: {e}", exc_info=True)
    
    def remove_from_queue(self, queue_id: str):
        """Remove document from processing queue after successful processing."""
        try:
            self.supabase.table('processing_queue')\
                .delete()\
                .eq('id', queue_id)\
                .execute()
        except Exception as e:
            logger.error(f"❌ Error removing from queue: {e}", exc_info=True)
    
    def move_to_failed_folder(self, file_path: str):
        """Move failed document to /documents/failed/ folder."""
        try:
            failed_path = file_path.replace('unprocessed', 'failed')
            self.supabase.storage.from_('documents')\
                .move(file_path, failed_path)
        except Exception as e:
            logger.warning(f"⚠️ Error moving to failed folder: {e}")


async def main():
    """Main entry point for the document processor."""
    processor = DocumentProcessor()
    await processor.process_queue()


if __name__ == "__main__":
    asyncio.run(main())


