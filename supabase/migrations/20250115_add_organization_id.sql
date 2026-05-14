-- Add organization_id to document_types table for better workspace filtering
-- This allows direct filtering without joining with users table

-- Add the column (allow NULL initially for existing rows)
ALTER TABLE public.document_types 
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Backfill organization_id from users table for existing rows
UPDATE public.document_types dt
SET organization_id = u.workspace_id
FROM public.users u
WHERE dt.user_id = u.id
AND dt.organization_id IS NULL;

-- Now make it NOT NULL since all rows should have values
ALTER TABLE public.document_types 
ALTER COLUMN organization_id SET NOT NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_document_types_organization_id 
ON public.document_types(organization_id);

-- Update RLS policies to use organization_id
-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own document types" ON public.document_types;
DROP POLICY IF EXISTS "Users can insert their own document types" ON public.document_types;
DROP POLICY IF EXISTS "Users can update their own document types" ON public.document_types;
DROP POLICY IF EXISTS "Users can delete their own document types" ON public.document_types;

-- Create new policies using organization_id
CREATE POLICY "Users can view document types in their workspace" 
ON public.document_types
FOR SELECT 
USING (
    organization_id IN (
        SELECT workspace_id FROM public.users WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can insert document types in their workspace" 
ON public.document_types
FOR INSERT 
WITH CHECK (
    organization_id IN (
        SELECT workspace_id FROM public.users WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can update document types in their workspace" 
ON public.document_types
FOR UPDATE 
USING (
    organization_id IN (
        SELECT workspace_id FROM public.users WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can delete document types in their workspace" 
ON public.document_types
FOR DELETE 
USING (
    organization_id IN (
        SELECT workspace_id FROM public.users WHERE id = auth.uid()
    )
);

-- Add comment for documentation
COMMENT ON COLUMN public.document_types.organization_id IS 'References the workspace_id from users table for workspace-level isolation';

