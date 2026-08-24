-- Recovered from production: applied directly (no migration file ever
-- committed for it). Client-portal document library — files an org shares
-- with a client through the portal (contracts, guides, invoices), separate
-- from the internal `attachments`/`client_files` tables.
CREATE TABLE IF NOT EXISTS public.portal_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id),
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
  created_by   uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS portal_documents_org_idx ON public.portal_documents (org_id);

ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_documents' AND policyname = 'org_members_read_portal_documents') THEN
    CREATE POLICY "org_members_read_portal_documents" ON public.portal_documents
      FOR SELECT
      USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_documents' AND policyname = 'admin_manager_manage_portal_documents') THEN
    CREATE POLICY "admin_manager_manage_portal_documents" ON public.portal_documents
      FOR ALL
      USING (
        org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = ANY (ARRAY['admin', 'manager'])
      )
      WITH CHECK (
        org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = ANY (ARRAY['admin', 'manager'])
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_documents' AND policyname = 'portal_user_reads_org_documents') THEN
    CREATE POLICY "portal_user_reads_org_documents" ON public.portal_documents
      FOR SELECT
      USING (
        deleted_at IS NULL
        AND org_id IN (SELECT org_id FROM public.client_portal_users WHERE user_id = auth.uid())
      );
  END IF;
END $$;
