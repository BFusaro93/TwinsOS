-- ─────────────────────────────────────────────────────────────────
-- Client Portal Document Library
-- Org-wide files (watering instructions, warranties, etc.) visible to
-- every client in the org — not tied to a specific client_id.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id),
  title        text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'General',
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  size_bytes   bigint,
  mime_type    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  created_by   uuid REFERENCES auth.users(id)
);

ALTER TABLE portal_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS portal_documents_org_idx ON portal_documents(org_id);

CREATE TRIGGER trg_portal_documents_updated_at
  BEFORE UPDATE ON portal_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Staff: admin/manager manage the library (upload, edit, remove).
CREATE POLICY "admin_manager_manage_portal_documents"
  ON portal_documents FOR ALL
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Staff: any org member can view the library (read-only).
CREATE POLICY "org_members_read_portal_documents"
  ON portal_documents FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Portal clients: read the org's library (same files for every client).
CREATE POLICY "portal_user_reads_org_documents"
  ON portal_documents FOR SELECT
  USING (
    deleted_at IS NULL
    AND org_id IN (SELECT org_id FROM client_portal_users WHERE user_id = auth.uid())
  );

-- ─── Storage bucket ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-documents',
  'portal-documents',
  false,
  52428800, -- 50MB limit
  ARRAY['image/jpeg','image/png','image/gif','image/webp',
        'application/pdf','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv','text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {org_id}/{timestamp}-{filename} — mirrors client-files bucket.
CREATE POLICY "org_portal_documents_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'portal-documents'
    AND (
      (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
      OR (storage.foldername(name))[1] IN (
        SELECT org_id::text FROM client_portal_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org_portal_documents_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-documents'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );

CREATE POLICY "org_portal_documents_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-documents'
    AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- ─── Portal feature toggle ──────────────────────────────────────────
ALTER TABLE client_portal_settings
  ADD COLUMN IF NOT EXISTS allow_documents boolean NOT NULL DEFAULT true;
