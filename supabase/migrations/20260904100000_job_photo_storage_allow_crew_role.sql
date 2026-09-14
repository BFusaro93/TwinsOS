-- Crew accounts (profiles.role = 'crew') can't load or upload job photos.
--
-- 20260824113952_photo_docs_storage_org_scope.sql rebuilt the
-- job-photos-original / job-photos-annotated storage.objects policies with
-- an explicit role list (admin/manager/technician/viewer/purchaser) AND
-- photo_module_access = true. 'crew' was never in that list, and the old
-- unscoped "org members can read ..." policies that had been silently
-- letting crew through were (correctly) dropped in
-- 20260901100000_drop_unscoped_job_photo_storage_policies.sql. Since then
-- every createSignedUrl() call from a crew login fails, so CrewPhotoView
-- renders each tile as its dark placeholder — "the photos are black" — and
-- field uploads from crew are rejected too.
--
-- usePhotoAccess() (src/modules/photo-docs/hooks/usePhotoAccess.ts) already
-- treats crew as auto-granted: read + upload, no annotate, no delete. Mirror
-- that here. Crew is granted by role alone (no photo_module_access flag),
-- matching the client-side rule; org-path scoping is unchanged.

DROP POLICY IF EXISTS "org_photo_originals_select" ON storage.objects;
CREATE POLICY "org_photo_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-photos-original'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          role = 'crew'
          OR (role IN ('admin', 'manager', 'technician', 'viewer', 'purchaser') AND photo_module_access = true)
        )
    )
  );

DROP POLICY IF EXISTS "org_photo_originals_insert" ON storage.objects;
CREATE POLICY "org_photo_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-photos-original'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          role = 'crew'
          OR (role IN ('admin', 'manager', 'technician') AND photo_module_access = true)
        )
    )
  );

DROP POLICY IF EXISTS "org_photo_annotated_select" ON storage.objects;
CREATE POLICY "org_photo_annotated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-photos-annotated'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          role = 'crew'
          OR (role IN ('admin', 'manager', 'technician', 'viewer', 'purchaser') AND photo_module_access = true)
        )
    )
  );

-- org_photo_originals_delete and org_photo_annotated_insert are unchanged:
-- crew cannot delete photos or write annotated composites.
