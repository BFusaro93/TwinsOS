-- Keep customers out of the projects tables.
--
-- `projects` carries a single policy, `org_members_projects`, FOR ALL with
-- `org_id = my_org_id()` and nothing else. my_org_id() reads profiles.org_id —
-- and a client-portal user (a CUSTOMER with a login) has a profiles row whose
-- org_id is the contractor's org. So the customer passes, for every command.
--
-- Measured on PROD as the portal user delivered@resend.dev, with RLS genuinely
-- evaluated (SET ROLE authenticated, not as the table owner; probe rolled back):
--
--   SELECT projects            -> 5 rows, $91,700 of contract value
--   top row readable           -> "Lakeside Clubhouse — Patio & Retaining Wall" @ $60,700
--   UPDATE projects.contract_price -> SUCCEEDED (6,070,000 -> 6,070,001)
--
-- A customer could read the job's internal cost and margin figures, and rewrite
-- the price they are contracted to pay. project_direct_items (36 rows) and
-- project_subcontract_costs (47 rows) repeat the same policy shape and hold the
-- cost detail behind that margin.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: gate on has_crm_access(). `projects` is
-- shared — Equipt's PO module reads it so a purchaser can assign a project to a
-- `project_material` line (integration point 4 in CLAUDE.md), via
-- LineItemsTable, NewPODialog, NewRequisitionDialog, PODetailPanel and
-- RequisitionDetailPanel. has_crm_access() is false for an Equipt-only
-- purchaser or technician with no crm_employees link, so gating on it would
-- break purchasing. The party who should not be here is the customer, not the
-- Equipt colleague.
--
-- Verified safe before writing: no route under src/app/api/portal or
-- src/app/portal reads projects at all, so portal users lose nothing they use.
-- /api/v1/projects is unaffected — it goes through adminClient() (service role,
-- which bypasses RLS) and scopes by auth.orgId itself.
--
-- Written as RESTRICTIVE policies so the existing permissive ones are left
-- exactly as they are — restrictive policies AND with them, which is the same
-- shape as the require_crm_access rollout.

-- A customer login: someone whose relationship to this org is a portal account.
-- The crm_employees / admin escape hatch means a staff member who also holds a
-- portal login (nobody does today — checked on PROD) keeps their access rather
-- than being silently locked out of Projects.
create or replace function public.is_client_portal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_portal_users cpu
    where cpu.user_id = auth.uid()
      and cpu.deleted_at is null
  )
  and not exists (
    select 1 from public.crm_employees ce
    where ce.user_id = auth.uid()
      and ce.deleted_at is null
  )
  and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin';
$$;

revoke execute on function public.is_client_portal_user() from public, anon;
grant execute on function public.is_client_portal_user() to authenticated;

do $do$
declare
  t text;
begin
  foreach t in array array['projects', 'project_direct_items', 'project_subcontract_costs'] loop
    execute format('drop policy if exists %I on public.%I', 'not_client_portal_user', t);
    execute format($p$
      create policy %I on public.%I
        as restrictive for all
        using (not public.is_client_portal_user())
        with check (not public.is_client_portal_user())
    $p$, 'not_client_portal_user', t);
  end loop;
end
$do$;

-- Crew accounts are staff, so the rule above lets them through — but a crew
-- login has no business rewriting a contract price or a cost line. This is the
-- same split 20260910160000 made for crm_job_services: writes closed, reads
-- left alone because the crew-visible dashboards read through security_invoker
-- rpt_* views and narrowing SELECT would silently change every number on them.
--
-- Nothing legitimate is lost: no route under src/app/api/crm/crew writes any of
-- these tables, and the clock-out routes that touch project/job costs use a
-- service-role client, which bypasses RLS entirely.
do $do$
declare
  t text;
begin
  foreach t in array array['projects', 'project_direct_items', 'project_subcontract_costs'] loop
    execute format('drop policy if exists %I on public.%I', 'crew_no_insert', t);
    execute format('drop policy if exists %I on public.%I', 'crew_no_update', t);
    execute format('drop policy if exists %I on public.%I', 'crew_no_delete', t);

    -- One per write command rather than a single FOR ALL: a restrictive FOR ALL
    -- can only offer `using` to DELETE, so `using (true)` would have left crew
    -- able to hard-delete a project while appearing to lock writes down.
    execute format($p$
      create policy %I on public.%I as restrictive for insert
        with check (coalesce(public.my_role(), '') <> 'crew')
    $p$, 'crew_no_insert', t);

    execute format($p$
      create policy %I on public.%I as restrictive for update
        using      (coalesce(public.my_role(), '') <> 'crew')
        with check (coalesce(public.my_role(), '') <> 'crew')
    $p$, 'crew_no_update', t);

    execute format($p$
      create policy %I on public.%I as restrictive for delete
        using (coalesce(public.my_role(), '') <> 'crew')
    $p$, 'crew_no_delete', t);
  end loop;
end
$do$;
