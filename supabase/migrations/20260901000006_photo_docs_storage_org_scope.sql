-- supabase/migrations-photo-docs/004_storage_policies.sql set up the
-- job-photos-original / job-photos-annotated bucket policies via
-- `INSERT INTO storage.policies (...)` — legacy Supabase Storage syntax
-- that predates the current storage.objects RLS model this project uses
-- everywhere else (see 20260830000000_attachments_storage_bucket_org_scope.sql).
-- Every one of those policies checked only role + photo_module_access —
-- NOT org membership — even though buildPhotoPath()
-- (src/modules/photo-docs/lib/photoStorage.ts) always writes photos under
-- an org-prefixed path (`{orgId}/{projectId}/{ts}-{rand}.ext`). Any
-- authenticated user with photo_module_access = true, in ANY org, could
-- list/read/upload/delete job photos belonging to every OTHER org by
-- supplying that org's id as the path prefix — a full cross-tenant photo
-- leak, the same class of bug already fixed for the shared `attachments`
-- bucket.
--
-- Replace with standard storage.objects RLS policies (matching the
-- attachments-bucket fix) that additionally require the path's org
-- segment to match the caller's own org_id.

DROP POLICY IF EXISTS "originals_admin_manager_select" ON storage.objects;
DROP POLICY IF EXISTS "originals_admin_manager_insert" ON storage.objects;
DROP POLICY IF EXISTS "originals_admin_manager_delete" ON storage.objects;
DROP POLICY IF EXISTS "originals_technician_select" ON storage.objects;
DROP POLICY IF EXISTS "originals_technician_insert" ON storage.objects;
DROP POLICY IF EXISTS "originals_viewer_select" ON storage.objects;
DROP POLICY IF EXISTS "annotated_admin_manager_all" ON storage.objects;
DROP POLICY IF EXISTS "annotated_admin_manager_insert" ON storage.objects;
DROP POLICY IF EXISTS "annotated_any_photo_access_select" ON storage.objects;

-- job-photos-original: admin/manager get full access; technicians get
-- read + upload; viewers/purchasers get read-only — same role matrix as
-- before, now additionally scoped to the caller's own org.

CREATE POLICY "org_photo_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-photos-original'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'technician', 'viewer', 'purchaser')
        AND photo_module_access = true
    )
  );

CREATE POLICY "org_photo_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-photos-original'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'technician')
        AND photo_module_access = true
    )
  );

CREATE POLICY "org_photo_originals_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'job-photos-original'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
        AND photo_module_access = true
    )
  );

-- job-photos-annotated: admin/manager full access + insert; every
-- photo-enabled role can read composites — same as before, org-scoped.

CREATE POLICY "org_photo_annotated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-photos-annotated'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'technician', 'viewer', 'purchaser')
        AND photo_module_access = true
    )
  );

CREATE POLICY "org_photo_annotated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-photos-annotated'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
        AND photo_module_access = true
    )
  );
