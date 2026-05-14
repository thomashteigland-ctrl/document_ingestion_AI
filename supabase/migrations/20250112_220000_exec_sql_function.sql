-- Create a function to execute SQL dynamically
-- This function allows the Edge Function to execute SQL statements
CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result text;
BEGIN
    -- Execute the SQL query
    EXECUTE sql_query;
    
    -- Return success message
    RETURN 'SQL executed successfully';
EXCEPTION
    WHEN OTHERS THEN
        -- Return error message
        RETURN 'Error: ' || SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;

-- Add schema_created column to document_types table
ALTER TABLE document_types 
ADD COLUMN IF NOT EXISTS schema_created BOOLEAN DEFAULT FALSE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_document_types_user_schema_created 
ON document_types(user_id, schema_created);
