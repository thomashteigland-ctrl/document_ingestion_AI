-- This migration should be run for each organization
-- It creates the documents table in the organization schema

-- Note: This will be created dynamically by the create_user_schema RPC function
-- But we can also create it manually for existing organizations

-- Example for organization_91b0e0f6_fa88_4ac1_839d_44413f4c2a49:
/*
CREATE TABLE IF NOT EXISTS organization_91b0e0f6_fa88_4ac1_839d_44413f4c2a49.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_type_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_documents_status ON organization_91b0e0f6_fa88_4ac1_839d_44413f4c2a49.documents(status);
CREATE INDEX IF NOT EXISTS idx_organization_documents_user ON organization_91b0e0f6_fa88_4ac1_839d_44413f4c2a49.documents(user_id);

ALTER TABLE organization_91b0e0f6_fa88_4ac1_839d_44413f4c2a49.documents ENABLE ROW LEVEL SECURITY;
*/

