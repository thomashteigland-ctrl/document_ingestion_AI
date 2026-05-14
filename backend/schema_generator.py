"""
Schema Generator Service
Converts UI schema definitions to SQL and manages dynamic table creation
"""

import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

@dataclass
class SchemaField:
    name: str
    type: str
    required: bool
    description: Optional[str] = None
    samples: Optional[List[str]] = None

@dataclass
class DocumentType:
    id: str
    name: str
    description: str
    schema_definition: Dict[str, Any]
    user_id: str

class SchemaGenerator:
    """Generates SQL schemas from document type definitions"""
    
    # Field type mapping from UI to SQL
    FIELD_TYPE_MAPPING = {
        'text': 'TEXT',
        'number': 'NUMERIC',
        'date': 'TIMESTAMP WITH TIME ZONE',
        'boolean': 'BOOLEAN',
        'email': 'VARCHAR(255)',
        'url': 'VARCHAR(500)'
    }
    
    def __init__(self):
        self.schema_cache = {}
    
    def sanitize_name(self, name: str) -> str:
        """Sanitize names for SQL identifiers"""
        # Remove special characters and replace spaces with underscores
        sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower())
        # Ensure it starts with a letter or underscore
        if sanitized and not sanitized[0].isalpha():
            sanitized = f"field_{sanitized}"
        return sanitized
    
    def map_field_type_to_sql(self, field: SchemaField) -> str:
        """Map UI field type to SQL column type"""
        sql_type = self.FIELD_TYPE_MAPPING.get(field.type, 'TEXT')
        
        # Add NOT NULL constraint if required
        if field.required:
            sql_type += ' NOT NULL'
        
        return sql_type
    
    def generate_table_sql(self, document_type: DocumentType) -> str:
        """Generate SQL for creating the main document table"""
        table_name = self.sanitize_name(document_type.name)
        schema_name = f"user_{document_type.user_id}"
        
        # Base table structure
        sql_parts = [
            f"CREATE TABLE IF NOT EXISTS {schema_name}.{table_name} (",
            "    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
            "    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,",
            "    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),",
            "    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
        ]
        
        # Add fields from schema definition
        fields = document_type.schema_definition.get('fields', [])
        for field_data in fields:
            field = SchemaField(**field_data)
            field_name = self.sanitize_name(field.name)
            sql_type = self.map_field_type_to_sql(field)
            sql_parts.append(f"    {field_name} {sql_type},")
        
        # Remove trailing comma and close table
        if sql_parts[-1].endswith(','):
            sql_parts[-1] = sql_parts[-1][:-1]
        sql_parts.append(");")
        
        return '\n'.join(sql_parts)
    
    def generate_order_line_table_sql(self, document_type: DocumentType) -> Optional[str]:
        """Generate SQL for creating order line table if needed"""
        if not document_type.schema_definition.get('contains_order_lines', False):
            return None
        
        table_name = self.sanitize_name(document_type.name)
        order_line_table_name = f"{table_name}_order_lines"
        schema_name = f"user_{document_type.user_id}"
        
        sql_parts = [
            f"CREATE TABLE IF NOT EXISTS {schema_name}.{order_line_table_name} (",
            "    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
            f"    parent_document_id UUID REFERENCES {schema_name}.{table_name}(id) ON DELETE CASCADE,",
            "    line_number INTEGER NOT NULL,",
            "    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),",
            "    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
        ]
        
        # Add order line fields
        order_line_fields = document_type.schema_definition.get('order_line_fields', [])
        for field_data in order_line_fields:
            field = SchemaField(**field_data)
            field_name = self.sanitize_name(field.name)
            sql_type = self.map_field_type_to_sql(field)
            sql_parts.append(f"    {field_name} {sql_type},")
        
        # Remove trailing comma and close table
        if sql_parts[-1].endswith(','):
            sql_parts[-1] = sql_parts[-1][:-1]
        sql_parts.append(");")
        
        return '\n'.join(sql_parts)
    
    def generate_user_schema_sql(self, user_id: str) -> str:
        """Generate SQL for creating user schema"""
        schema_name = f"user_{user_id}"
        return f"CREATE SCHEMA IF NOT EXISTS {schema_name};"
    
    def generate_rls_policies_sql(self, document_type: DocumentType) -> List[str]:
        """Generate Row Level Security policies for user schema"""
        table_name = self.sanitize_name(document_type.name)
        schema_name = f"user_{document_type.user_id}"
        
        policies = [
            f"ALTER TABLE {schema_name}.{table_name} ENABLE ROW LEVEL SECURITY;",
            f"CREATE POLICY \"{schema_name}_{table_name}_policy\" ON {schema_name}.{table_name}",
            f"    FOR ALL USING (auth.uid() = '{document_type.user_id}');"
        ]
        
        # Add RLS for order line table if it exists
        if document_type.schema_definition.get('contains_order_lines', False):
            order_line_table_name = f"{table_name}_order_lines"
            policies.extend([
                f"ALTER TABLE {schema_name}.{order_line_table_name} ENABLE ROW LEVEL SECURITY;",
                f"CREATE POLICY \"{schema_name}_{order_line_table_name}_policy\" ON {schema_name}.{order_line_table_name}",
                f"    FOR ALL USING (auth.uid() = '{document_type.user_id}');"
            ])
        
        return policies
    
    def generate_complete_schema_sql(self, document_type: DocumentType) -> List[str]:
        """Generate complete SQL for a document type including schema, tables, and policies"""
        sql_statements = []
        
        # Create user schema
        sql_statements.append(self.generate_user_schema_sql(document_type.user_id))
        
        # Create main table
        sql_statements.append(self.generate_table_sql(document_type))
        
        # Create order line table if needed
        order_line_sql = self.generate_order_line_table_sql(document_type)
        if order_line_sql:
            sql_statements.append(order_line_sql)
        
        # Add RLS policies
        sql_statements.extend(self.generate_rls_policies_sql(document_type))
        
        return sql_statements
    
    def validate_schema_definition(self, schema_definition: Dict[str, Any]) -> List[str]:
        """Validate schema definition and return any errors"""
        errors = []
        
        # Check required fields
        if 'fields' not in schema_definition:
            errors.append("Schema definition must contain 'fields' array")
            return errors
        
        fields = schema_definition.get('fields', [])
        if not isinstance(fields, list):
            errors.append("'fields' must be an array")
            return errors
        
        # Validate each field
        field_names = set()
        for i, field_data in enumerate(fields):
            if not isinstance(field_data, dict):
                errors.append(f"Field {i} must be an object")
                continue
            
            # Check required field properties
            if 'name' not in field_data:
                errors.append(f"Field {i} must have a 'name' property")
            elif not field_data['name'].strip():
                errors.append(f"Field {i} name cannot be empty")
            else:
                field_name = field_data['name'].strip()
                if field_name in field_names:
                    errors.append(f"Duplicate field name: {field_name}")
                else:
                    field_names.add(field_name)
            
            if 'type' not in field_data:
                errors.append(f"Field {i} must have a 'type' property")
            elif field_data['type'] not in self.FIELD_TYPE_MAPPING:
                errors.append(f"Field {i} has invalid type: {field_data['type']}")
        
        # Validate order line fields if present
        if schema_definition.get('contains_order_lines', False):
            order_line_fields = schema_definition.get('order_line_fields', [])
            if not isinstance(order_line_fields, list):
                errors.append("'order_line_fields' must be an array")
            else:
                order_line_field_names = set()
                for i, field_data in enumerate(order_line_fields):
                    if not isinstance(field_data, dict):
                        errors.append(f"Order line field {i} must be an object")
                        continue
                    
                    if 'name' not in field_data:
                        errors.append(f"Order line field {i} must have a 'name' property")
                    elif not field_data['name'].strip():
                        errors.append(f"Order line field {i} name cannot be empty")
                    else:
                        field_name = field_data['name'].strip()
                        if field_name in order_line_field_names:
                            errors.append(f"Duplicate order line field name: {field_name}")
                        else:
                            order_line_field_names.add(field_name)
                    
                    if 'type' not in field_data:
                        errors.append(f"Order line field {i} must have a 'type' property")
                    elif field_data['type'] not in self.FIELD_TYPE_MAPPING:
                        errors.append(f"Order line field {i} has invalid type: {field_data['type']}")
        
        return errors

# Example usage and testing
if __name__ == "__main__":
    generator = SchemaGenerator()
    
    # Example document type
    example_doc_type = DocumentType(
        id="test-123",
        name="Invoice",
        description="Invoice document type",
        user_id="user-456",
        schema_definition={
            "fields": [
                {
                    "name": "customer_name",
                    "type": "text",
                    "required": True,
                    "description": "Name of the customer"
                },
                {
                    "name": "total_amount",
                    "type": "number",
                    "required": True,
                    "description": "Total invoice amount"
                },
                {
                    "name": "invoice_date",
                    "type": "date",
                    "required": True,
                    "description": "Date of the invoice"
                }
            ],
            "contains_order_lines": True,
            "order_line_fields": [
                {
                    "name": "product_sku",
                    "type": "text",
                    "required": True,
                    "description": "Product SKU"
                },
                {
                    "name": "quantity",
                    "type": "number",
                    "required": True,
                    "description": "Quantity ordered"
                },
                {
                    "name": "unit_price",
                    "type": "number",
                    "required": True,
                    "description": "Price per unit"
                }
            ]
        }
    )
    
    # Generate complete schema
    sql_statements = generator.generate_complete_schema_sql(example_doc_type)
    
    print("Generated SQL Schema:")
    print("=" * 50)
    for i, sql in enumerate(sql_statements, 1):
        print(f"-- Statement {i}")
        print(sql)
        print()
