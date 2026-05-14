-- Create organization-based storage RLS policies
-- This allows authenticated users to access only their organization folders

-- Policy 1: Allow authenticated users to INSERT files into their organization folder
CREATE POLICY "organization_upload_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents' 
    AND (SPLIT_PART(name, '/', 1) = 'organization-' || (
        SELECT organization_id::text 
        FROM public.users 
        WHERE id = auth.uid()
    ))
);

-- Policy 2: Allow authenticated users to SELECT files from their organization folder  
CREATE POLICY "organization_read_policy"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (SPLIT_PART(name, '/', 1) = 'organization-' || (
        SELECT organization_id::text 
        FROM public.users 
        WHERE id = auth.uid()
    ))
);

-- Policy 3: Allow authenticated users to UPDATE files in their organization folder
CREATE POLICY "organization_update_policy"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (SPLIT_PART(name, '/', 1) = 'organization-' || (
        SELECT organization_id::text 
        FROM public.users 
        WHERE id = auth.uid()
    ))
)
WITH CHECK (
    bucket_id = 'documents'
    AND (SPLIT_PART(name, '/', 1) = 'organization-' || (
        SELECT organization_id::text 
        FROM public.users 
        WHERE id = auth.uid()
    ))
);

-- Policy 4: Allow authenticated users to DELETE files from their organization folder
CREATE POLICY "organization_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (SPLIT_PART(name, '/', 1) = 'organization-' || (
        SELECT organization_id::text 
        FROM public.users 
        WHERE id = auth.uid()
    ))
);
