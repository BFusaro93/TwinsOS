-- ============================================================
-- Projects: crew logins can't see project financials; change orders and the contract
-- price need the projects permission key.
--
-- A crew login (profiles.role = 'crew') could SELECT every project's contract, EAC and labor
-- rates, its subcontract and direct costs, its change orders and billing milestones — and
-- INSERT/UPDATE unapproved change orders (probe: "crew insert CO => ALLOWED"). Nothing in the
-- crew app reads these tables (verified: crew pages/hooks and the views/RPCs they use never
-- touch them; the only views over them are rpt_projects_wip and rpt_audit_log).
--
-- 1. RESTRICTIVE "not crew" policies: SELECT on projects / project_subcontract_costs /
--    project_direct_items (their writes already had crew_no_* policies), ALL commands on
--    project_change_orders / estimate_milestones.
-- 2. project_change_orders writes require sched_add_modify_projects (the key the Change Orders
--    tab and approve/reverse_change_order() already use). RPCs (SECURITY DEFINER) are exempt
--    through _crm_direct_user_write(), like enforce_estimate_milestone_write_permission.
-- 3. Changing projects.original_contract_price requires sched_add_modify_projects. Column-
--    scoped: Equipt purchasers keep editing every other project column. Inserts are not gated
--    (creating a project with its contract is the normal Equipt flow), and the convert flow
--    seeds the contract through link_estimate_to_project() (DEFINER, exempt).
-- ============================================================

-- 1. Crew visibility
drop policy if exists crew_no_select on public.projects;
create policy crew_no_select on public.projects
  as restrictive for select
  using ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_select on public.project_subcontract_costs;
create policy crew_no_select on public.project_subcontract_costs
  as restrictive for select
  using ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_select on public.project_direct_items;
create policy crew_no_select on public.project_direct_items
  as restrictive for select
  using ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_access on public.project_change_orders;
create policy crew_no_access on public.project_change_orders
  as restrictive for all
  using ((select public.my_role()) is distinct from 'crew')
  with check ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_access on public.estimate_milestones;
create policy crew_no_access on public.estimate_milestones
  as restrictive for all
  using ((select public.my_role()) is distinct from 'crew')
  with check ((select public.my_role()) is distinct from 'crew');

-- 2. Change-order writes need the projects key.
create or replace function public.enforce_project_change_order_write_permission()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- Direct API writes only: approve/reverse_change_order() and link_estimate_to_project()
  -- check their own permissions and run as the definer.
  if public._crm_direct_user_write()
     and not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'You do not have permission to edit change orders'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists a_project_change_orders_enforce_write_permission on public.project_change_orders;
create trigger a_project_change_orders_enforce_write_permission
  before insert or update or delete on public.project_change_orders
  for each row execute function public.enforce_project_change_order_write_permission();

-- 3. The contract price needs the projects key.
create or replace function public.enforce_project_contract_price_permission()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if public._crm_direct_user_write()
     and new.original_contract_price is distinct from old.original_contract_price
     and not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'You do not have permission to change a project''s contract price'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists a_projects_contract_price_permission on public.projects;
create trigger a_projects_contract_price_permission
  before update of original_contract_price on public.projects
  for each row execute function public.enforce_project_contract_price_permission();
