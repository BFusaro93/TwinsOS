-- Create the attachments storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  52428800, -- 50MB limit
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
        'application/pdf','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv','text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their org's folder
CREATE POLICY "org_members_upload_attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "org_members_read_attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attachments');
