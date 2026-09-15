-- job-photos-original / job-photos-annotated Storage buckets were created
-- without file_size_limit or allowed_mime_types (unlike every other bucket
-- in this project — attachments, client-files, form-attachments, etc. all
-- set both). That left them wide open to arbitrarily large or arbitrary
-- -type uploads.
--
-- Size limit is set generously large (500MB, well above this codebase's
-- usual 50MB attachment convention) because these are full-resolution
-- phone-camera photos and occasionally short video clips, not documents.
--
-- Allowed MIME types cover every file type PhotoUploader.tsx's file
-- inputs advertise accepting (src/modules/photo-docs/components/
-- PhotoUploader.tsx): image/* (including HEIC/HEIF, the default iPhone
-- capture format), video/* for the Videos picker, and the office/document
-- types listed on the Files picker's `accept` attribute.
--
-- NOTE: this migration must be applied to BOTH the prod and test Supabase
-- projects per this repo's documented dual-environment workflow — it is
-- not applied automatically by writing this file.

UPDATE storage.buckets
SET
  file_size_limit = 524288000, -- 500MB
  allowed_mime_types = ARRAY[
    -- images (including HEIC/HEIF from iPhone camera)
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    -- short video clips
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
    -- documents (PhotoUploader's "Files" picker accept list)
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
WHERE id IN ('job-photos-original', 'job-photos-annotated');
