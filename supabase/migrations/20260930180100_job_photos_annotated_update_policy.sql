-- Re-saving an annotated photo failed.
--
-- uploadAnnotatedPhoto() (src/modules/photo-docs/lib/photoStorage.ts) uploads
-- with upsert: true so re-saving annotations replaces the composite. A storage
-- upsert onto an existing object needs an UPDATE policy on storage.objects,
-- but 20260901100000_drop_unscoped_job_photo_storage_policies.sql dropped the
-- only one ("org members can upsert annotated", which was unscoped) and no
-- org-scoped replacement was ever added — so the first save worked (INSERT)
-- and every later save was rejected.
--
-- This mirrors "org_photo_annotated_insert" (20260824113952, unchanged since —
-- 20260904100000 left it as-is on purpose): same bucket, first path segment
-- must be the caller's org_id, and only admin/manager with
-- photo_module_access. Applied to both USING (which existing object may be
-- overwritten) and WITH CHECK (what it may become), so an update can't move
-- an object into another org's folder. Crew stays excluded, matching
-- usePhotoAccess() (crew: no annotate).

drop policy if exists "org_photo_annotated_update" on storage.objects;
create policy "org_photo_annotated_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'job-photos-annotated'
    and (storage.foldername(name))[1] = (select org_id::text from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'manager')
        and photo_module_access = true
    )
  )
  with check (
    bucket_id = 'job-photos-annotated'
    and (storage.foldername(name))[1] = (select org_id::text from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'manager')
        and photo_module_access = true
    )
  );
