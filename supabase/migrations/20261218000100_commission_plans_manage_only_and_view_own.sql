-- Commission plan setup is compensation data. Until now `commission_view` (meant for reading
-- earnings/statements) could also read every plan, rule and rep assignment straight from the
-- tables. Reading those is now `commission_manage` only; earnings and statements are untouched
-- (earnings come from SECURITY DEFINER RPCs, statements from their own policies).
--
-- Also adds `commission_view_own` ("My Commissions"): a rep sees only their own earnings and
-- statements. The data side already allows that by identity (crm_employees.user_id = auth.uid())
-- in the statement/line policies and in crm_commission_lines / crm_commission_pending_clawbacks;
-- this key just surfaces the screen, and is granted to the seeded Sales / Account Mgr role.

drop policy if exists crm_commission_plans_select on public.crm_commission_plans;
create policy crm_commission_plans_select on public.crm_commission_plans for select
  using (org_id = my_org_id() and has_settings_permission('commission_manage'));

drop policy if exists crm_commission_rules_select on public.crm_commission_plan_rules;
create policy crm_commission_rules_select on public.crm_commission_plan_rules for select
  using (org_id = my_org_id() and has_settings_permission('commission_manage'));

drop policy if exists crm_commission_assign_select on public.crm_commission_assignments;
create policy crm_commission_assign_select on public.crm_commission_assignments for select
  using (org_id = my_org_id() and has_settings_permission('commission_manage'));

-- Additive: only sets the new key, never touches other permissions.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('commission_view_own', true)
where deleted_at is null and name in ('Sales / Account Mgr');
