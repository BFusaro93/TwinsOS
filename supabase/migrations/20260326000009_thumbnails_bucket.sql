-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: thumbnails_bucket
-- Creates a public Supabase Storage bucket for vehicle/asset/part thumbnail
-- photos. Photos are served as publicly accessible URLs (no expiry).
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the bucket (public so getPublicUrl() works without signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  true,
  10485760,  -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the thumbnails bucket
CREATE POLICY "auth_users_upload_thumbnails"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'thumbnails');

-- Allow authenticated users to update their own uploads
CREATE POLICY "auth_users_update_thumbnails"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'thumbnails');

-- Allow anyone to read thumbnails (public bucket)
CREATE POLICY "public_read_thumbnails"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'thumbnails');
