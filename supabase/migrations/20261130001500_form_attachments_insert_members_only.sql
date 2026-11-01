-- Anonymous visitors could upload straight to the form-attachments bucket under any
-- published form's folder, bypassing the submit route's Turnstile and rate limit
-- (15 MB per file, orphans kept forever). Public form uploads now go through
-- POST /api/public/forms/[slug]/upload-url, which rate limits and mints a one-shot
-- signed upload URL (signed uploads don't need an insert policy). Only org members
-- filling a form in-app still insert directly.
--
-- DEPLOY ORDER: apply AFTER the code that calls /upload-url is live, or public
-- form attachment uploads fail in between.
drop policy if exists form_attachments_insert on storage.objects;
create policy form_attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'form-attachments'
    and exists (
      select 1 from public.crm_forms f
      where f.id::text = (storage.foldername(objects.name))[1]
        and f.deleted_at is null
        and f.org_id = my_org_id()
    )
  );
