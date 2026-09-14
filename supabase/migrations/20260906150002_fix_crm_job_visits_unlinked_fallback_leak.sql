-- "crew members see own visits" had a fallback branch --
-- `OR NOT EXISTS (SELECT 1 FROM crm_employees WHERE user_id = auth.uid())`
-- -- that granted an org member with NO employee row at all full visibility
-- into every visit in the org. That was presumably meant to keep admins
-- without a crm_employees row working, but as a side effect it also let
-- any unlinked, non-admin, non-crew profile (manager/viewer/purchaser/etc.)
-- see all visits, defeating the has_crm_access() gate just added to the
-- other permissive policy on this table ("org members manage visits") --
-- Postgres OR-combines permissive policies, so that one bypass was enough.
-- Scope the fallback to admins only, matching how has_crm_access() already
-- treats no-employee-row admins elsewhere.
drop policy if exists "crew members see own visits" on public.crm_job_visits;
create policy "crew members see own visits" on public.crm_job_visits
  for select
  using (
    org_id = my_org_id()
    and (
      (exists (
        select 1 from crm_employees e
        where e.user_id = auth.uid() and e.is_active = true and e.user_type <> 'field'
      ))
      or (
        public.my_role() = 'admin'
        and not exists (select 1 from crm_employees where crm_employees.user_id = auth.uid())
      )
      or (crew_id in (
        select cm.crew_id
        from crm_crew_members cm
        join crm_employees e on e.id = cm.employee_id
        where e.user_id = auth.uid() and e.is_active = true
      ))
    )
  );
