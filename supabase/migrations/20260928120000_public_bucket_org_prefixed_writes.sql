-- =============================================================================
-- Public buckets `thumbnails` and `document-images`: org-scoped writes
--
-- !!! APPLY ONLY AFTER THE MATCHING CODE HAS DEPLOYED !!!
-- The app now writes every object under `${my_org_id()}/...`
-- (BrandingTab, ThumbnailUpload, DocumentBuilder, RichTextEditor via
-- src/lib/supabase/storage-org-prefix.ts). Applying this before that deploy
-- makes every logo / asset thumbnail / document image upload fail.
--
-- Before: INSERT/UPDATE/DELETE only checked bucket_id, and paths were not
-- org-prefixed, so any signed-in user of any tenant could overwrite or delete
-- another tenant's logo, asset/part thumbnails and document images.
--
-- After: writes require the first path segment to be the caller's org
-- (my_org_id(), which honours staff impersonation). SELECT stays public
-- (these are public buckets rendered in emails/PDFs). Legacy unprefixed
-- objects (logos/, thumbnails/, assets/, parts/, bare filenames) stay readable
-- but become immutable to clients — re-uploading creates a new prefixed object.
-- Idempotent.
-- =============================================================================

DROP POLICY IF EXISTS auth_users_upload_thumbnails ON storage.objects;
DROP POLICY IF EXISTS auth_users_update_thumbnails ON storage.objects;
DROP POLICY IF EXISTS auth_users_delete_thumbnails ON storage.objects;
DROP POLICY IF EXISTS auth_users_upload_document_images ON storage.objects;
DROP POLICY IF EXISTS auth_users_update_document_images ON storage.objects;
DROP POLICY IF EXISTS auth_users_delete_document_images ON storage.objects;

CREATE POLICY auth_users_upload_thumbnails ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  );

CREATE POLICY auth_users_update_thumbnails ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  )
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  );

CREATE POLICY auth_users_delete_thumbnails ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  );

CREATE POLICY auth_users_upload_document_images ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-images'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  );

CREATE POLICY auth_users_update_document_images ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'document-images'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  )
  WITH CHECK (
    bucket_id = 'document-images'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  );

CREATE POLICY auth_users_delete_document_images ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-images'
    AND (storage.foldername(name))[1] = (SELECT public.my_org_id())::text
  );
