-- Bug sweep round 15 (area 1): stop cross-tenant LISTING of the public image buckets.
--
-- WHAT / WHY
--   storage.objects SELECT policies `public_read_document_images` and
--   `public_read_thumbnails` were `bucket_id = X` only (role public), so any signed-in
--   user — a trial signup, a portal customer — could call the Storage list API and
--   enumerate every tenant's logos, thumbnails and document images.
--
--   Both buckets are `public = true`: the app only ever renders them through
--   getPublicUrl (/storage/v1/object/public/...), which does NOT go through RLS, so
--   emails, PDFs, the portal and anonymous proposal pages keep showing the images.
--   The SELECT policy is only needed for list / authenticated download / upsert, and
--   every app upload (BrandingTab logo, ThumbnailUpload, DocumentBuilder,
--   RichTextEditor) writes a fresh `<my_org_id()>/...` path via getStorageOrgPrefix,
--   so scoping SELECT to the caller's org folder keeps upsert working.
--   Legacy folders in `thumbnails` (parts/, assets/, thumbnails/, logos/) are only
--   written by scripts/*.mjs with the service-role key (bypasses RLS); nothing in the
--   app re-uploads to those paths. Their public URLs keep working.
--
--   Separate oddity, deliberately NOT changed: anon listing of storage.objects
--   currently fails only because portal_documents_allowed() isn't executable by anon —
--   do not "fix" that by granting it.
--
-- PROD: apply BEFORE or AFTER the code deploy (no code change depends on it).
--   No data pre-check needed.

drop policy if exists public_read_document_images on storage.objects;
create policy public_read_document_images on storage.objects
  for select to authenticated
  using (
    bucket_id = 'document-images'
    and (storage.foldername(name))[1] = (select public.my_org_id())::text
  );

drop policy if exists public_read_thumbnails on storage.objects;
create policy public_read_thumbnails on storage.objects
  for select to authenticated
  using (
    bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = (select public.my_org_id())::text
  );
