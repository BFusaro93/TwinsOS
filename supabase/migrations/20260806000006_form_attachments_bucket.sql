-- File Attachment form fields had no upload handling at all — the public
-- form rendered a bare <input type="file"> with no onChange/state binding,
-- so whatever a visitor "attached" was silently discarded. This adds the
-- storage side of a real implementation:
--
-- - A PRIVATE bucket (not publicly readable/listable) with a hard size cap
--   and an allow-list of mime types enforced by Storage itself, independent
--   of any application code.
-- - An INSERT-only policy scoping uploads to a real form: the object path's
--   first segment must be a crm_forms.id that is either published (the
--   anonymous public-form case) or belongs to the caller's own org (the
--   authenticated internal "Fill Out Form" test case, which can target a
--   draft form).
-- - No SELECT/UPDATE/DELETE policy for anon/authenticated — reads happen
--   exclusively through a signed URL generated server-side by an org-scoped
--   route (src/app/api/crm/forms/attachments/signed-url), consistent with
--   this project's "generate signed URLs at read time, never store one"
--   storage convention.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'form-attachments',
  'form-attachments',
  false,
  15728640, -- 15 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS form_attachments_insert ON storage.objects;
CREATE POLICY form_attachments_insert ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'form-attachments'
  AND EXISTS (
    SELECT 1 FROM public.crm_forms f
    WHERE f.id::text = (storage.foldername(name))[1]
      AND f.deleted_at IS NULL
      AND (f.status = 'published' OR f.org_id = public.my_org_id())
  )
);
