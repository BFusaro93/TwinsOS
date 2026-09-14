-- Registering for a second org's client portal with an email already
-- registered for a different org's portal always failed — Supabase Auth
-- users are global by email, and client_portal_users.user_id had a hard
-- UNIQUE constraint, so a person who is legitimately a client of two
-- different Landscapt-using companies could never complete registration
-- for the second one. Support this properly (org-picker-after-login, not
-- silently merging/guessing) by allowing one auth user to hold one
-- client_portal_users row per org.
ALTER TABLE public.client_portal_users
  DROP CONSTRAINT IF EXISTS client_portal_users_user_id_key;

ALTER TABLE public.client_portal_users
  ADD CONSTRAINT client_portal_users_user_id_org_id_key UNIQUE (user_id, org_id);

-- A handful of the earliest portal read policies matched only on client_id,
-- relying on the (now-removed) one-row-per-user invariant to keep that
-- scoped to a single org. With multiple orgs now possible per user, pair
-- every one of them with an explicit org_id match too — defense in depth
-- so RLS itself can never mix a portal session's two orgs' data even if an
-- application query were ever missing its own org_id filter.
DROP POLICY IF EXISTS "portal user reads own client" ON public.clients;
CREATE POLICY "portal user reads own client"
  ON public.clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.deleted_at IS NULL
        AND cpu.client_id = clients.id
        AND cpu.org_id = clients.org_id
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_invoices' AND policyname = 'portal user reads own invoices') THEN
    DROP POLICY "portal user reads own invoices" ON public.crm_invoices;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_invoices') THEN
    EXECUTE $policy$
      CREATE POLICY "portal user reads own invoices"
        ON public.crm_invoices FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.client_portal_users cpu
            WHERE cpu.user_id = auth.uid()
              AND cpu.deleted_at IS NULL
              AND cpu.client_id = crm_invoices.client_id
              AND cpu.org_id = crm_invoices.org_id
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_job_visits' AND policyname = 'portal user reads own visits') THEN
    DROP POLICY "portal user reads own visits" ON public.crm_job_visits;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_job_visits') THEN
    EXECUTE $policy$
      CREATE POLICY "portal user reads own visits"
        ON public.crm_job_visits FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.client_portal_users cpu
            WHERE cpu.user_id = auth.uid()
              AND cpu.deleted_at IS NULL
              AND cpu.client_id = crm_job_visits.client_id
              AND cpu.org_id = crm_job_visits.org_id
          )
        )
    $policy$;
  END IF;
END $$;

DROP POLICY IF EXISTS "portal user reads own estimates" ON public.estimates;
CREATE POLICY "portal user reads own estimates"
  ON public.estimates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.deleted_at IS NULL
        AND cpu.client_id = estimates.client_id
        AND cpu.org_id = estimates.org_id
    )
  );

DROP POLICY IF EXISTS "portal user reads own estimate line items" ON public.estimate_line_items;
CREATE POLICY "portal user reads own estimate line items"
  ON public.estimate_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.client_portal_users cpu
        ON cpu.client_id = e.client_id AND cpu.org_id = e.org_id
      WHERE e.id = estimate_line_items.estimate_id
        AND cpu.user_id = auth.uid()
        AND cpu.deleted_at IS NULL
    )
  );
