import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { organization_id, document_type_name, column_name, is_order_line = false } = await req.json()
    
    console.log('=== Remove Column Function ===')
    console.log('Received organization_id:', organization_id)
    console.log('Received document_type_name:', document_type_name)
    console.log('Received column_name:', column_name)
    console.log('Received is_order_line:', is_order_line)

    if (!organization_id || !document_type_name || !column_name) {
      console.log('Missing required parameters')
      return new Response(
        JSON.stringify({ error: 'organization_id, document_type_name, and column_name are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const schemaName = `organization_${organization_id.toString().replace(/-/g, '_')}`
    const tableName = sanitizeName(document_type_name)
    const targetTableName = is_order_line ? `${tableName}_order_lines` : tableName
    const sanitizedColumnName = sanitizeName(column_name)

    console.log('Generated schema name:', schemaName)
    console.log('Target table name:', targetTableName)
    console.log('Sanitized column name:', sanitizedColumnName)

    // Drop the column
    const dropColumnSQL = `ALTER TABLE ${schemaName}.${targetTableName} DROP COLUMN IF EXISTS ${sanitizedColumnName};`
    console.log('Executing SQL:', dropColumnSQL)

    const { data: result, error } = await supabaseClient.rpc('exec_sql', {
      sql_query: dropColumnSQL
    })

    console.log('Drop column result:', { result, error })

    if (error) {
      console.error('Error dropping column:', error)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('✅ Column removed successfully')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Column ${column_name} removed from ${targetTableName}`,
        executed_sql: dropColumnSQL
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in removeColumn function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
