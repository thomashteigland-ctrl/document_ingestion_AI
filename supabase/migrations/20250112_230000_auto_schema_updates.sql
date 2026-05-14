-- Add schema_created column to document_types table
ALTER TABLE document_types 
ADD COLUMN IF NOT EXISTS schema_created BOOLEAN DEFAULT FALSE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_document_types_user_schema_created 
ON document_types(user_id, schema_created);

-- Create a function to call the schema update Edge Function
CREATE OR REPLACE FUNCTION update_user_schema()
RETURNS TRIGGER AS $$
DECLARE
    function_url TEXT;
    function_key TEXT;
    payload JSONB;
    response TEXT;
BEGIN
    -- Get the Edge Function URL and key from environment
    function_url := current_setting('app.settings.edge_function_url', true);
    function_key := current_setting('app.settings.edge_function_key', true);
    
    -- If not set, use default values (these should be set in production)
    IF function_url IS NULL THEN
        function_url := 'https://dhkzbmrlgcxaxrwimzjs.supabase.co/functions/v1/updateUserSchema';
    END IF;
    
    IF function_key IS NULL THEN
        function_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa3pibXJsZ2N4YXhyd2ltempzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk0ODQ3MywiZXhwIjoyMDczNTI0NDczfQ.YourServiceRoleKeyHere';
    END IF;
    
    -- Prepare payload
    payload := jsonb_build_object(
        'document_type_id', NEW.id,
        'user_id', NEW.user_id
    );
    
    -- Call the Edge Function (this is a simplified version)
    -- In production, you'd use http extension or similar
    -- For now, we'll just mark as schema_created = true
    UPDATE document_types 
    SET schema_created = true 
    WHERE id = NEW.id;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RAISE WARNING 'Failed to update user schema: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT and UPDATE on document_types
CREATE OR REPLACE TRIGGER trigger_update_user_schema
    AFTER INSERT OR UPDATE OF schema_definition ON document_types
    FOR EACH ROW
    EXECUTE FUNCTION update_user_schema();

-- Create a simpler approach: just mark schema as needing update
-- This will be handled by the frontend calling the update function
CREATE OR REPLACE FUNCTION mark_schema_for_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark the schema as needing update
    UPDATE document_types 
    SET schema_created = false,
        updated_at = NOW()
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for schema definition changes
DROP TRIGGER IF EXISTS trigger_mark_schema_for_update ON document_types;
CREATE TRIGGER trigger_mark_schema_for_update
    AFTER UPDATE OF schema_definition ON document_types
    FOR EACH ROW
    EXECUTE FUNCTION mark_schema_for_update();

-- Create a function to get user's schema status
CREATE OR REPLACE FUNCTION get_user_schema_status(user_uuid UUID)
RETURNS TABLE (
    document_type_id UUID,
    name TEXT,
    description TEXT,
    schema_created BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dt.id,
        dt.name,
        dt.description,
        dt.schema_created,
        dt.created_at,
        dt.updated_at
    FROM document_types dt
    WHERE dt.user_id = user_uuid
    ORDER BY dt.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_schema_status(UUID) TO authenticated;
