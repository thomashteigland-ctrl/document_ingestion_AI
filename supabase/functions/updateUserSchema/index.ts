import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Field type mapping from UI to SQL
const FIELD_TYPE_MAPPING = {
  'text': 'TEXT',
  'number': 'NUMERIC',
  'date': 'TIMESTAMP WITH TIME ZONE',
  'boolean': 'BOOLEAN',
  'email': 'VARCHAR(255)',
  'url': 'VARCHAR(500)'
}

function sanitizeName(name: string): string {
  // Remove special characters and replace spaces with underscores
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
  // Ensure it starts with a letter or underscore
  if (sanitized && !sanitized[0].match(/[a-zA-Z_]/)) {
    return `field_${sanitized}`
  }
  return sanitized
}

function mapFieldTypeToSQL(field: any): string {
  const sqlType = FIELD_TYPE_MAPPING[field.type] || 'TEXT'
  return field.required ? `${sqlType} NOT NULL` : sqlType
}

function generateTableSQL(documentType: any, schemaName: string): string {
  const tableName = sanitizeName(documentType.name)
  
  const sqlParts = [
    `CREATE TABLE IF NOT EXISTS ${schemaName}.${tableName} (`,
    "    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
    `    document_id UUID REFERENCES ${schemaName}.documents(id) ON DELETE CASCADE,`,
    "    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),",
    "    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
  ]
  
  // Add fields from schema definition
  const fields = documentType.schema_definition?.fields || []
  for (const field of fields) {
    const fieldName = sanitizeName(field.name)
    const sqlType = mapFieldTypeToSQL(field)
    sqlParts.push(`    ${fieldName} ${sqlType},`)
  }
  
  // Remove trailing comma and close table
  if (sqlParts[sqlParts.length - 1].endsWith(',')) {
    sqlParts[sqlParts.length - 1] = sqlParts[sqlParts.length - 1].slice(0, -1)
  }
  sqlParts.push(");")
  
  return sqlParts.join('\n')
}

async function updateTableColumns(supabaseClient: any, documentType: any, schemaName: string): Promise<string[]> {
  const tableName = sanitizeName(documentType.name)
  const executedStatements = []
  
  try {
    const newFields = documentType.schema_definition?.fields || []
    const newFieldNames = newFields.map(field => sanitizeName(field.name))
    console.log('Processing fields:', newFields.map(f => f.name))
    console.log('Sanitized field names:', newFieldNames)
    
    // Since we can't reliably detect existing columns, we'll use a different approach:
    // 1. Always try to add all current fields (using IF NOT EXISTS)
    // 2. For removal, we'll need to track this differently
    
    // Add columns for all current fields
    for (const field of newFields) {
      const fieldName = sanitizeName(field.name)
      const sqlType = mapFieldTypeToSQL(field)
      const addColumnSQL = `ALTER TABLE ${schemaName}.${tableName} ADD COLUMN IF NOT EXISTS ${fieldName} ${sqlType};`
      
      console.log(`Adding column: ${addColumnSQL}`)
      
      const { data: addResult, error: addError } = await supabaseClient.rpc('exec_sql', {
        sql_query: addColumnSQL
      })
      
      executedStatements.push({
        sql: addColumnSQL,
        success: !addError,
        result: addError ? addError.message : 'Success'
      })
      
      if (addError) {
        console.warn(`Failed to add column ${fieldName}:`, addError)
      } else {
        console.log(`✅ Successfully added column ${fieldName}`)
      }
    }
    
    // For now, we'll skip column removal since we can't reliably detect existing columns
    // This means columns won't be removed when fields are deleted from the UI
    // TODO: Implement a better solution for column removal
    console.log('⚠️ Column removal is temporarily disabled due to exec_sql limitations')
    
  } catch (error) {
    console.error('Error updating table columns:', error)
  }
  
  return executedStatements
}

async function updateOrderLineTableColumns(supabaseClient: any, documentType: any, schemaName: string): Promise<string[]> {
  const tableName = sanitizeName(documentType.name)
  const orderLineTableName = `${tableName}_order_lines`
  const executedStatements = []
  
  if (!documentType.schema_definition?.contains_order_lines) {
    return executedStatements
  }
  
  try {
    const newFields = documentType.schema_definition?.order_line_fields || []
    console.log('Processing order line fields:', newFields.map(f => f.name))
    
    // Add columns for all current order line fields
    for (const field of newFields) {
      const fieldName = sanitizeName(field.name)
      const sqlType = mapFieldTypeToSQL(field)
      const addColumnSQL = `ALTER TABLE ${schemaName}.${orderLineTableName} ADD COLUMN IF NOT EXISTS ${fieldName} ${sqlType};`
      
      console.log(`Adding order line column: ${addColumnSQL}`)
      
      const { data: addResult, error: addError } = await supabaseClient.rpc('exec_sql', {
        sql_query: addColumnSQL
      })
      
      executedStatements.push({
        sql: addColumnSQL,
        success: !addError,
        result: addError ? addError.message : 'Success'
      })
      
      if (addError) {
        console.warn(`Failed to add order line column ${fieldName}:`, addError)
      } else {
        console.log(`✅ Successfully added order line column ${fieldName}`)
      }
    }
    
    // For now, we'll skip order line column removal since we can't reliably detect existing columns
    console.log('⚠️ Order line column removal is temporarily disabled due to exec_sql limitations')
    
  } catch (error) {
    console.error('Error updating order line table columns:', error)
  }
  
  return executedStatements
}

function generateOrderLineTableSQL(documentType: any, schemaName: string): string | null {
  if (!documentType.schema_definition?.contains_order_lines) {
    return null
  }
  
  const tableName = sanitizeName(documentType.name)
  const orderLineTableName = `${tableName}_order_lines`
  
  const sqlParts = [
    `CREATE TABLE IF NOT EXISTS ${schemaName}.${orderLineTableName} (`,
    "    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
    `    parent_document_id UUID REFERENCES ${schemaName}.${tableName}(id) ON DELETE CASCADE,`,
    "    line_number INTEGER NOT NULL,",
    "    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),",
    "    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
  ]
  
  // Add order line fields
  const orderLineFields = documentType.schema_definition?.order_line_fields || []
  for (const field of orderLineFields) {
    const fieldName = sanitizeName(field.name)
    const sqlType = mapFieldTypeToSQL(field)
    sqlParts.push(`    ${fieldName} ${sqlType},`)
  }
  
  // Remove trailing comma and close table
  if (sqlParts[sqlParts.length - 1].endsWith(',')) {
    sqlParts[sqlParts.length - 1] = sqlParts[sqlParts.length - 1].slice(0, -1)
  }
  sqlParts.push(");")
  
  return sqlParts.join('\n')
}

function generateRLSPoliciesSQL(documentType: any, schemaName: string): string[] {
  const tableName = sanitizeName(documentType.name)
  
  const policies = [
    `ALTER TABLE ${schemaName}.${tableName} ENABLE ROW LEVEL SECURITY;`,
    `CREATE POLICY "${schemaName}_${tableName}_policy" ON ${schemaName}.${tableName}`,
    `    FOR ALL USING (auth.uid() = (SELECT user_id FROM documents WHERE id = document_id));`
  ]
  
  // Add RLS for order line table if it exists
  if (documentType.schema_definition?.contains_order_lines) {
    const orderLineTableName = `${tableName}_order_lines`
    policies.push(
      `ALTER TABLE ${schemaName}.${orderLineTableName} ENABLE ROW LEVEL SECURITY;`,
      `CREATE POLICY "${schemaName}_${orderLineTableName}_policy" ON ${schemaName}.${orderLineTableName}`,
      `    FOR ALL USING (auth.uid() = (SELECT user_id FROM documents WHERE id = (SELECT document_id FROM ${schemaName}.${tableName} WHERE id = parent_document_id)));`
    )
  }
  
  return policies
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { document_type_id, organization_id } = await req.json()
    
    console.log('=== Edge Function Debug ===')
    console.log('Received document_type_id:', document_type_id)
    console.log('Received organization_id:', organization_id)

    if (!document_type_id || !organization_id) {
      console.log('Missing required parameters')
      return new Response(
        JSON.stringify({ error: 'document_type_id and organization_id are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch document type from database
    console.log('Fetching document type with ID:', document_type_id)
    const { data: docTypeData, error: fetchError } = await supabaseClient
      .from('document_types')
      .select('*')
      .eq('id', document_type_id)
      .eq('organization_id', organization_id)
      .single()

    console.log('Document type fetch result:', { docTypeData, fetchError })

    if (fetchError || !docTypeData) {
      console.error('Error fetching document type:', fetchError)
      return new Response(
        JSON.stringify({ 
          error: 'Document type not found', 
          details: fetchError?.message 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const schemaName = `organization_${organization_id.toString().replace(/-/g, '_')}`
    console.log('Generated schema name:', schemaName)
    const executedStatements = []

    try {
      // Generate and execute main table SQL
      const mainTableSQL = generateTableSQL(docTypeData, schemaName)
      console.log('Generated main table SQL:', mainTableSQL)
      
      const { data: mainResult, error: mainError } = await supabaseClient.rpc('exec_sql', {
        sql_query: mainTableSQL
      })
      
      console.log('Main table execution result:', { mainResult, mainError })
      
      executedStatements.push({
        sql: mainTableSQL,
        success: !mainError,
        result: mainError ? mainError.message : 'Success'
      })

      if (mainError) {
        throw mainError
      }

      // Update table columns (add/remove/modify fields)
      const columnUpdateStatements = await updateTableColumns(supabaseClient, docTypeData, schemaName)
      executedStatements.push(...columnUpdateStatements)

      // Generate and execute order line table SQL if needed
      const orderLineSQL = generateOrderLineTableSQL(docTypeData, schemaName)
      if (orderLineSQL) {
        const { data: orderLineResult, error: orderLineError } = await supabaseClient.rpc('exec_sql', {
          sql_query: orderLineSQL
        })
        
        executedStatements.push({
          sql: orderLineSQL,
          success: !orderLineError,
          result: orderLineError ? orderLineError.message : 'Success'
        })

        if (orderLineError) {
          console.warn('Order line table creation failed:', orderLineError)
        }

        // Update order line table columns
        const orderLineColumnUpdateStatements = await updateOrderLineTableColumns(supabaseClient, docTypeData, schemaName)
        executedStatements.push(...orderLineColumnUpdateStatements)
      }

      // Generate and execute RLS policies
      const rlsPolicies = generateRLSPoliciesSQL(docTypeData, schemaName)
      for (const policySQL of rlsPolicies) {
        const { data: policyResult, error: policyError } = await supabaseClient.rpc('exec_sql', {
          sql_query: policySQL
        })
        
        executedStatements.push({
          sql: policySQL,
          success: !policyError,
          result: policyError ? policyError.message : 'Success'
        })

        if (policyError) {
          console.warn('RLS policy creation failed:', policyError)
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Schema updated successfully for ${docTypeData.name}`,
          executed_statements: executedStatements
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } catch (error) {
      console.error('Schema update error:', error)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message,
          executed_statements: executedStatements
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
