-- Create processing_queue table in public schema
CREATE TABLE IF NOT EXISTS public.processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    document_id TEXT NOT NULL,  -- TEXT to match fileId from frontend
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES public.organization(uuid_id) ON DELETE CASCADE,
    UNIQUE (organization_id, document_id)  -- Ensure idempotency
);

-- Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON public.processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_organization ON public.processing_queue(organization_id);

-- Enable RLS
ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for processing_queue
CREATE POLICY "Users can view processing queue in their organization" 
ON public.processing_queue
FOR SELECT 
USING (
    organization_id IN (
        SELECT organization_id 
        FROM public.users 
        WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can insert into processing queue" 
ON public.processing_queue
FOR INSERT 
WITH CHECK (
    organization_id IN (
        SELECT organization_id 
        FROM public.users 
        WHERE id = auth.uid()
    )
);

CREATE POLICY "Service can update processing queue" 
ON public.processing_queue
FOR UPDATE 
USING (true);

CREATE POLICY "Service can delete from processing queue" 
ON public.processing_queue
FOR DELETE 
USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_processing_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER processing_queue_updated_at
    BEFORE UPDATE ON public.processing_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.update_processing_queue_updated_at();

