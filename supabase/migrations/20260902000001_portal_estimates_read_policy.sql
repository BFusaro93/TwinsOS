-- The client-portal foundation migration (20260630000003_client_portal.sql)
-- tried to add a "portal user reads own estimates" SELECT policy, but its
-- DO block guarded on `information_schema.tables WHERE table_name =
-- 'crm_estimates'` — the estimates table has always actually been named
-- `estimates` (see 20260623000009_crm_estimates_schema.sql), so that guard
-- never matched and the policy silently never got created.
--
-- Every portal read path that queries `estimates` (src/app/portal/(shell)/
-- page.tsx, src/app/portal/(shell)/estimates/page.tsx, and
-- src/app/api/portal/dashboard/route.ts) uses the RLS-bound server client
-- (createClient(), not the service client), relying on exactly this policy
-- existing. Without it, `estimates` only has "org members can manage
-- estimates" (staff-only, via profiles.org_id) — portal users have no
-- profiles row, so RLS silently returns zero rows. Result: the portal's
-- "Open Estimates" dashboard widget and the whole /portal/estimates page
-- have always shown empty, even when the client has estimates sent to them.
--
-- estimate_line_items has no client_id column, so its policy has to go
-- through estimates.id the same way the estimates policy goes through
-- client_portal_users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'estimates' AND policyname = 'portal user reads own estimates'
  ) THEN
    CREATE POLICY "portal user reads own estimates"
      ON public.estimates FOR SELECT
      USING (
        client_id IN (
          SELECT client_id FROM public.client_portal_users
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'estimate_line_items' AND policyname = 'portal user reads own estimate line items'
  ) THEN
    CREATE POLICY "portal user reads own estimate line items"
      ON public.estimate_line_items FOR SELECT
      USING (
        estimate_id IN (
          SELECT id FROM public.estimates
          WHERE client_id IN (
            SELECT client_id FROM public.client_portal_users
            WHERE user_id = auth.uid() AND deleted_at IS NULL
          )
        )
      );
  END IF;
END $$;
