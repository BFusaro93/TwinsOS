-- Staff impersonation, phase 2 (priority slice): the scheduling/job/client
-- tables this feature exists for — clients, crm_jobs, crm_job_visits,
-- crm_crews, crm_crew_members, crm_crew_member_times,
-- crm_crew_daily_members, estimates — still inline
-- `(select org_id from profiles where id = auth.uid())` instead of calling
-- my_org_id(), so patching my_org_id() alone (see
-- 20260831130000_staff_impersonation_foundation.sql) doesn't cover them yet.
-- This converts just this priority slice; the remaining ~65 tables +
-- storage.objects are a separate follow-up.
--
-- Every policy body below is copied verbatim from the LIVE definitions on
-- prod (queried via pg_policies, not reconstructed from migration-file
-- history — the file-grep approach that scoped this work already produced
-- one false negative), with only the org_id subquery swapped for
-- my_org_id(). No other condition (role checks, crew-visit joins,
-- client-portal joins) is changed.

-- clients ---------------------------------------------------------------
DROP POLICY IF EXISTS "crew can read own assigned clients" ON clients;
CREATE POLICY "crew can read own assigned clients" ON clients
FOR SELECT
USING (
  org_id = my_org_id()
  AND my_role() = 'crew'
  AND EXISTS (
    SELECT 1 FROM crm_job_visits v JOIN crm_crews c ON c.id = v.crew_id
    WHERE v.client_id = clients.id AND v.deleted_at IS NULL AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "non-crew org members can read clients" ON clients;
CREATE POLICY "non-crew org members can read clients" ON clients
FOR SELECT
USING (org_id = my_org_id() AND my_role() IS DISTINCT FROM 'crew');

DROP POLICY IF EXISTS "org members can insert clients" ON clients;
CREATE POLICY "org members can insert clients" ON clients
FOR INSERT
WITH CHECK (org_id = my_org_id());

DROP POLICY IF EXISTS "org members can update clients" ON clients;
CREATE POLICY "org members can update clients" ON clients
FOR UPDATE
USING (org_id = my_org_id());

-- crm_crew_daily_members --------------------------------------------------
DROP POLICY IF EXISTS "org members manage crew daily overrides" ON crm_crew_daily_members;
CREATE POLICY "org members manage crew daily overrides" ON crm_crew_daily_members
USING (org_id = my_org_id())
WITH CHECK (org_id = my_org_id());

-- crm_crew_member_times ---------------------------------------------------
DROP POLICY IF EXISTS "org members manage crew member times" ON crm_crew_member_times;
CREATE POLICY "org members manage crew member times" ON crm_crew_member_times
USING (org_id = my_org_id())
WITH CHECK (org_id = my_org_id());

-- crm_crews ----------------------------------------------------------------
DROP POLICY IF EXISTS "org members can manage crm_crews" ON crm_crews;
CREATE POLICY "org members can manage crm_crews" ON crm_crews
USING (org_id = my_org_id())
WITH CHECK (org_id = my_org_id());

-- crm_crew_members ----------------------------------------------------------
-- Note: this table also has a separate, older policy "org members can manage
-- crew members" that ALREADY calls my_org_id() (already impersonation-safe,
-- left untouched) — the two policies are redundant duplicates from
-- different migrations, pre-existing and out of scope to deduplicate here.
DROP POLICY IF EXISTS "org members can manage crm_crew_members" ON crm_crew_members;
CREATE POLICY "org members can manage crm_crew_members" ON crm_crew_members
USING (org_id = my_org_id())
WITH CHECK (org_id = my_org_id());

-- crm_job_visits ------------------------------------------------------------
DROP POLICY IF EXISTS "crew members see own visits" ON crm_job_visits;
CREATE POLICY "crew members see own visits" ON crm_job_visits
FOR SELECT
USING (
  org_id = my_org_id()
  AND (
    EXISTS (SELECT 1 FROM crm_employees e WHERE e.user_id = auth.uid() AND e.is_active = true AND e.user_type <> 'field')
    OR NOT EXISTS (SELECT 1 FROM crm_employees WHERE crm_employees.user_id = auth.uid())
    OR crew_id IN (
      SELECT cm.crew_id FROM crm_crew_members cm JOIN crm_employees e ON e.id = cm.employee_id
      WHERE e.user_id = auth.uid() AND e.is_active = true
    )
  )
);

DROP POLICY IF EXISTS "org members manage visits" ON crm_job_visits;
CREATE POLICY "org members manage visits" ON crm_job_visits
USING (org_id = my_org_id())
WITH CHECK (org_id = my_org_id());

-- crm_jobs --------------------------------------------------------------
DROP POLICY IF EXISTS "org members can insert crm_jobs" ON crm_jobs;
CREATE POLICY "org members can insert crm_jobs" ON crm_jobs
FOR INSERT
WITH CHECK (org_id = my_org_id());

DROP POLICY IF EXISTS "org members can read crm_jobs" ON crm_jobs;
CREATE POLICY "org members can read crm_jobs" ON crm_jobs
FOR SELECT
USING (org_id = my_org_id());

DROP POLICY IF EXISTS "org members can update crm_jobs" ON crm_jobs;
CREATE POLICY "org members can update crm_jobs" ON crm_jobs
FOR UPDATE
USING (org_id = my_org_id());

-- estimates -----------------------------------------------------------------
DROP POLICY IF EXISTS "org members can manage estimates" ON estimates;
CREATE POLICY "org members can manage estimates" ON estimates
USING (org_id = my_org_id() AND my_role() IS DISTINCT FROM 'crew')
WITH CHECK (org_id = my_org_id() AND my_role() IS DISTINCT FROM 'crew');
