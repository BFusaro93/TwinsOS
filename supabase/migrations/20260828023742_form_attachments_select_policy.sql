-- The form-attachments storage bucket only ever had an INSERT policy
-- (form_attachments_insert), so `storage.objects` had no SELECT policy for
-- it at all. This went unnoticed because the public anonymous submit route
-- uses a service-role client (bypasses storage RLS entirely), but the
-- internal "Fill Out Form" test-submit route uses the staff member's own
-- session client — any SELECT/list() against the bucket (e.g. the new
-- attachment-existence check in submitFormResponse) silently came back
-- empty for a real, legitimately-uploaded file, since RLS default-denies
-- with no matching policy.
--
-- Mirrors the insert policy's own scoping: readable if the form is
-- published (a submitter needs to know their own submission's attachment
-- round-trips correctly), or if the caller belongs to the form's org (staff
-- viewing/testing their own org's forms).
create policy form_attachments_select
  on storage.objects
  for select
  using (
    bucket_id = 'form-attachments'
    and exists (
      select 1 from public.crm_forms f
      where f.id::text = (storage.foldername(objects.name))[1]
        and f.deleted_at is null
        and (f.status = 'published' or f.org_id = public.my_org_id())
    )
  );
