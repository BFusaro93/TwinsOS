-- The client_files table + RLS policies were created in
-- 20260707181546_crm_client_custom_fields_and_files.sql, but the
-- "client-files" Storage bucket itself was never created — only the
-- application code (src/lib/hooks/use-client-files.ts) and the DB row
-- side existed. Every upload attempt from a Client profile hit
-- Supabase Storage's "Bucket not found" error, surfaced in the UI as
-- "Failed to upload file".
--
-- Path convention written by useUploadClientFile: {org_id}/{client_id}/
-- {timestamp}-{filename}. Scope Storage RLS on the org_id path segment,
-- consistent with the other org-scoped buckets in this project
-- (attachments, portal-documents).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-files',
  'client-files',
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

DROP POLICY IF EXISTS "org_members_read_client_files" ON storage.objects;
CREATE POLICY "org_members_read_client_files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-files'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "org_members_upload_client_files" ON storage.objects;
CREATE POLICY "org_members_upload_client_files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "org_members_delete_client_files" ON storage.objects;
CREATE POLICY "org_members_delete_client_files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-files'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);
