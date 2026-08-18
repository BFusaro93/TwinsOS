-- Follow-up to 20260901000008_restrict_crew_role_from_financial_tables.sql.
--
-- That migration deliberately left `clients` untouched, because crew
-- legitimately needs client name/phone/address for their OWN assigned
-- visits — src/lib/hooks/use-crew-app.ts's useMyCrewVisits()/useVisitDetail()/
-- useStopDetail() all join
--   clients(display_name, primary_phone, billing_address, billing_city,
--           billing_state, billing_zip)
-- off crm_job_visits rows filtered by crew_id = <the caller's crew> and
-- scheduled_date. But the existing "org members can read clients" policy
-- (20260617000001_crm_clients.sql) has no role check at all:
--   create policy "org members can read clients" on clients for select
--     using (org_id = (select org_id from profiles where id = auth.uid()));
-- GlobalSearchDialog.tsx calls useClients() (src/lib/hooks/use-clients.ts —
-- `select("*, client_tags(tag)")` with no filter beyond deleted_at)
-- unconditionally for every role, so a crew tablet login (or anyone who
-- obtains its shared credential) can browse the entire org's client list —
-- billing info, balances, gate codes, everything — not just the handful of
-- clients on today's assigned stops. This is the same leak class as the
-- financial-tables gap, just narrower.
--
-- How a crew login maps to a crew: crm_crews.user_id (added in
-- 20260624000008_crm_crews_user_id.sql) links one auth user to one
-- crm_crews row. use-crew-app.ts resolves the caller's crew via
-- `crm_crews.select("id").eq("user_id", userId)`, then reads
-- crm_job_visits filtered by that crew_id.
--
-- Fix: split the single "org members can read clients" SELECT policy into
-- two — everyone who isn't crew keeps today's unrestricted, org-scoped read
-- (unchanged), while crew's read is additionally scoped to only the clients
-- referenced by a non-deleted crm_job_visits row assigned to a crm_crews row
-- the caller's auth.uid() actually owns via user_id. INSERT/UPDATE on
-- clients are intentionally left untouched — crew never writes to clients,
-- and this migration only closes the SELECT-side read gap that
-- GlobalSearchDialog exposed.

DROP POLICY IF EXISTS "org members can read clients" ON public.clients;

CREATE POLICY "non-crew org members can read clients" ON public.clients
  FOR SELECT
  USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND public.my_role() IS DISTINCT FROM 'crew'
  );

CREATE POLICY "crew can read own assigned clients" ON public.clients
  FOR SELECT
  USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND public.my_role() = 'crew'
    AND EXISTS (
      SELECT 1
      FROM public.crm_job_visits v
      JOIN public.crm_crews c ON c.id = v.crew_id
      WHERE v.client_id = clients.id
        AND v.deleted_at IS NULL
        AND c.user_id = auth.uid()
    )
  );
