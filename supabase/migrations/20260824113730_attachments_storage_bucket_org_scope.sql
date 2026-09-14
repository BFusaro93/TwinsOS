-- The attachments bucket's INSERT/SELECT policies checked only bucket_id —
-- no path or org restriction at all — despite the comment claiming "upload
-- to their org's folder." Combined with storage_path being built as
-- `${recordType}/${recordId}/${filename}` (no org_id segment), any
-- authenticated user from any org could call storage upload/createSignedUrl/
-- list directly against the bucket and read or overwrite another org's
-- ticket/estimate/WO attachments, given or guessing a recordType/recordId
-- path.
--
-- INSERT: use-attachments.ts now prefixes new uploads' storagePath with the
-- uploader's own org_id (`${orgId}/${recordType}/${recordId}/${filename}`),
-- so new uploads are checked against that path segment directly — there's no
-- `attachments` row yet at upload time to join against (the DB row is
-- inserted only after the storage upload succeeds), so the path itself is
-- the only thing available to verify.
--
-- SELECT/DELETE: checked via a join against the `attachments` table's own
-- org_id instead of parsing the path, so this doesn't require rewriting
-- already-uploaded objects that predate the org-prefixed path format —
-- every attachment, old or new format, already has a real org_id on its
-- table row.

DROP POLICY IF EXISTS "org_members_upload_attachments" ON storage.objects;
DROP POLICY IF EXISTS "org_members_read_attachments" ON storage.objects;

CREATE POLICY "org_members_upload_attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "org_members_read_attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND EXISTS (
    SELECT 1 FROM public.attachments a
    WHERE a.storage_path = storage.objects.name
      AND a.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "org_members_delete_attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND EXISTS (
    SELECT 1 FROM public.attachments a
    WHERE a.storage_path = storage.objects.name
      AND a.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  )
);
