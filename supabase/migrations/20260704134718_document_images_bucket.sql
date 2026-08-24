-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: document_images_bucket
-- Creates a public Supabase Storage bucket for images embedded in CRM document
-- templates (client emails, estimates, invoices, marketing). Public because
-- these images are embedded in outbound emails and must remain resolvable
-- indefinitely — a signed URL's expiry would break images in a client's inbox.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-images',
  'document-images',
  true,
  10485760,  -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload document images
CREATE POLICY "auth_users_upload_document_images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'document-images');

-- Allow authenticated users to update/replace their org's uploads
CREATE POLICY "auth_users_update_document_images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'document-images');

-- Allow authenticated users to remove their org's uploads
CREATE POLICY "auth_users_delete_document_images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'document-images');

-- Allow anyone to read document images (public bucket — embedded in outbound emails)
CREATE POLICY "public_read_document_images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'document-images');
