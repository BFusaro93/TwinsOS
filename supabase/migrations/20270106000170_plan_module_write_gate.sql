-- Round 14 (equipt F8): an org's plan decides which product it can WRITE to,
-- enforced in the database (the UI gate CMMSGate / useModuleAccess was the
-- only check, so a Landscapt-only org could create work orders through
-- PostgREST and vice versa).
--
-- org_has_module('equipt' | 'landscapt') mirrors getModulesForPlan() in
-- src/lib/stripe/plans.ts — keep the two in step:
--   plan 'cmms'    -> Equipt only
--   plan 'starter' -> Landscapt only
--   anything else  -> both ('growth', 'enterprise', 'trial', 'canceled',
--                     legacy/unknown values). 'canceled' stays read-only via
--                     the separate read_only_when_canceled policies.
-- The service role and in-database calls (no JWT) always pass.
--
-- RESTRICTIVE INSERT / UPDATE / DELETE policies TO authenticated on the
-- tables each product OWNS. Reads are not gated (owner decision: block writes
-- only). Shared tables are deliberately NOT gated: vendors, product_items,
-- requisitions / purchase_orders / lines, goods receipts, projects (and their
-- child tables), approval flows, crm_employees / crm_roles (WO and PM assignee
-- pickers use employees in Equipt-only orgs), attachments, comments,
-- notifications, automations, reports and dashboards.
--
-- PROD pre-check (read-only) — which orgs are on a single-module plan, and do
-- they already have rows in the other product's tables (those orgs would lose
-- write access to them):
--   select o.id, o.name, o.plan,
--          (select count(*) from work_orders w where w.org_id = o.id and w.deleted_at is null) as work_orders,
--          (select count(*) from assets a where a.org_id = o.id and a.deleted_at is null)       as assets,
--          (select count(*) from parts p where p.org_id = o.id and p.deleted_at is null)        as parts,
--          (select count(*) from clients c where c.org_id = o.id and c.deleted_at is null)      as clients,
--          (select count(*) from crm_jobs j where j.org_id = o.id and j.deleted_at is null)     as crm_jobs,
--          (select count(*) from crm_invoices i where i.org_id = o.id and i.deleted_at is null) as crm_invoices
--     from organizations o
--    where o.plan in ('cmms', 'starter')
--    order by o.plan, o.name;
--   -- expected: 'cmms' orgs show 0 clients/crm_jobs/crm_invoices, 'starter'
--   -- orgs show 0 work_orders/assets/parts. Every other plan is unaffected:
--   select plan, count(*) from organizations group by plan order by plan;
--
-- Deploy order: BEFORE or AFTER the code deploy (the /api/v1 check in
-- src/lib/api/auth.ts is the API-key twin of this gate; neither depends on
-- the other).

create or replace function public.org_has_module(p_module text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_plan text;
begin
  if coalesce(auth.role(), '') = 'service_role' or (auth.uid() is null and auth.role() is null) then
    return true;
  end if;
  select o.plan into v_plan from public.organizations o where o.id = public.my_org_id();
  if v_plan = 'cmms' then
    return p_module = 'equipt';
  elsif v_plan = 'starter' then
    return p_module = 'landscapt';
  end if;
  -- growth / enterprise / trial / canceled / unknown / no org: both modules
  -- (other policies decide what a login with no org may do).
  return true;
end;
$function$;

revoke all on function public.org_has_module(text) from public, anon;
grant execute on function public.org_has_module(text) to authenticated, service_role;

do $$
declare
  t text;
  v_equipt text[] := array[
    'assets','asset_parts','work_orders','wo_parts','wo_labor_entries','wo_vendor_charges',
    'pm_schedules','pm_schedule_parts','pm_schedule_assets','pm_schedule_asset_parts','pm_schedule_pauses',
    'parts','meters','meter_readings','vehicles','maintenance_requests'
  ];
  v_landscapt text[] := array[
    'clients','client_activity','client_contacts','client_properties','client_tags','client_files',
    'estimates','estimate_line_items','estimate_versions','estimate_templates','estimate_template_items',
    'crm_jobs','crm_job_services','crm_job_visits','crm_job_products','crm_job_materials',
    'crm_invoices','crm_invoice_line_items','crm_payments','crm_payment_allocations',
    'crm_contracts','crm_contract_services','crm_packages','crm_package_services','crm_services',
    'crm_tickets','crm_campaigns','crm_automations','crm_chemical_applications',
    'crm_crews','crm_crew_members','crm_snow_routes','crm_storm_events','crm_forms'
  ];
  v_mod text;
begin
  foreach v_mod in array array['equipt','landscapt'] loop
    foreach t in array (case when v_mod = 'equipt' then v_equipt else v_landscapt end) loop
      if to_regclass('public.' || t) is null then
        raise notice 'org_has_module: table % not found, skipped', t;
        continue;
      end if;
      execute format('drop policy if exists plan_module_write_ins on public.%I', t);
      execute format('drop policy if exists plan_module_write_upd on public.%I', t);
      execute format('drop policy if exists plan_module_write_del on public.%I', t);
      execute format($p$create policy plan_module_write_ins on public.%I
        as restrictive for insert to authenticated
        with check ((select public.org_has_module(%L)))$p$, t, v_mod);
      execute format($p$create policy plan_module_write_upd on public.%I
        as restrictive for update to authenticated
        using ((select public.org_has_module(%L)))
        with check ((select public.org_has_module(%L)))$p$, t, v_mod, v_mod);
      execute format($p$create policy plan_module_write_del on public.%I
        as restrictive for delete to authenticated
        using ((select public.org_has_module(%L)))$p$, t, v_mod);
    end loop;
  end loop;
end $$;
