import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { organization_id } = await req.json()

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: 'organization_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create organization schema
    const schemaName = `organization_${organization_id.toString().replace(/-/g, '_')}`
    const createSchemaSQL = `CREATE SCHEMA IF NOT EXISTS ${schemaName};`
    
    const { data: schemaResult, error: schemaError } = await supabaseClient.rpc('exec_sql', {
      sql_query: createSchemaSQL
    })

    if (schemaError) {
      console.error('Error creating user schema:', schemaError)
      return new Response(
        JSON.stringify({ error: 'Failed to create user schema', details: schemaError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create the documents table for the organization
    const createDocumentsTableSQL = `
      CREATE TABLE IF NOT EXISTS ${schemaName}.documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_documents_status ON ${schemaName}.documents(status);
      CREATE INDEX IF NOT EXISTS idx_documents_user ON ${schemaName}.documents(user_id);
    `
    
    const { data: tableResult, error: tableError } = await supabaseClient.rpc('exec_sql', {
      sql_query: createDocumentsTableSQL
    })
    
    if (tableError) {
      console.error('Error creating documents table:', tableError)
      return new Response(
        JSON.stringify({ error: 'Failed to create documents table', details: tableError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Enable RLS on the documents table
    const enableRLSSQL = `
      ALTER TABLE ${schemaName}.documents ENABLE ROW LEVEL SECURITY;
      
      CREATE POLICY "Users can view documents in their organization" ON ${schemaName}.documents
        FOR SELECT USING (
          user_id IN (
            SELECT id FROM auth.users WHERE id = auth.uid()
          )
        );
      
      CREATE POLICY "Users can insert documents in their organization" ON ${schemaName}.documents
        FOR INSERT WITH CHECK (
          user_id IN (
            SELECT id FROM auth.users WHERE id = auth.uid()
          )
        );
      
      CREATE POLICY "Users can update documents in their organization" ON ${schemaName}.documents
        FOR UPDATE USING (
          user_id IN (
            SELECT id FROM auth.users WHERE id = auth.uid()
          )
        );
    `
    
    const { data: rlsResult, error: rlsError } = await supabaseClient.rpc('exec_sql', {
      sql_query: enableRLSSQL
    })

    if (rlsError) {
      console.error('Error enabling RLS:', rlsError)
      // Don't fail the entire operation for RLS errors
    }

    // Verify schema was created
    const verifySQL = `
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = '${schemaName}';
    `;
    
    const { data: verifyResult, error: verifyError } = await supabaseClient.rpc('exec_sql', { 
      sql_query: verifySQL 
    });
    
    if (verifyError) {
      console.error('Error verifying schema:', verifyError);
    }
    
    // Check if schema exists in results
    const schemaExists = verifyResult && verifyResult.length > 0;
    console.log('Schema verification result:', { data: verifyResult, exists: schemaExists });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Organization schema ${schemaName} created successfully`,
        schema_name: schemaName,
        verified: schemaExists,
        verification_data: verifyResult
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

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
