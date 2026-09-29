-- The viewer / requestor / purchaser app roles (profiles.role) are EQUIPT
-- roles. 20260929120000 applied them to every org table, which overrode the
-- Landscapt role (crm_roles permissions) — e.g. a viewer whose Landscapt role
-- grants social_media_edit could no longer save social media stats.
--
-- Scope them to Equipt only:
--   * role_write_guard_* stays on the Equipt tables (Purchasing, Maintenance,
--     Vendors, approvals); comments / attachments keep it only for Equipt
--     record types. Every other table drops it — Landscapt access is decided
--     by crm_roles / has_crm_access / has_settings_permission, as before.
--   * _org_mismatch() no longer refuses viewers/requestors; the Equipt
--     inventory writers use the new _equipt_org_mismatch() instead.
--   * submit_for_approval refuses viewers/requestors only for requisitions
--     and POs (estimate approvals follow the Landscapt role).
--   * crm_reconcile_invoice_payments drops its role check.

CREATE OR REPLACE FUNCTION public._org_mismatch(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when auth.role() = 'service_role' then false
    when auth.role() is null and auth.uid() is null then false  -- in-database (cron/trigger) call, no JWT
    else p_org is distinct from public.my_org_id()
  end;
$function$;

-- _org_mismatch plus the Equipt role limit (viewer / requestor are read-only).
CREATE OR REPLACE FUNCTION public._equipt_org_mismatch(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._role_write_blocked() or public._org_mismatch(p_org);
$function$;
revoke all on function public._equipt_org_mismatch(uuid) from public, anon, authenticated;

-- Repoint the Equipt parts/products inventory writers. (adjust_product_item_
-- quantity stays on _org_mismatch: Landscapt job-product usage calls it.)
do $$
declare
  f record;
  def text;
  n int := 0;
begin
  for f in
    select p.oid
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('adjust_part_quantity', 'adjust_part_quantity_manual', 'correct_part_receipt',
                         'receive_part_quantity', 'receive_product_cost_layer', 'set_wo_part_stock')
  loop
    def := pg_get_functiondef(f.oid);
    if position('_org_mismatch(' in def) = 0 then
      raise exception 'expected _org_mismatch in %', f.oid::regprocedure;
    end if;
    execute replace(def, 'public._org_mismatch(', 'public._equipt_org_mismatch(');
    n := n + 1;
  end loop;
  if n <> 7 then
    raise exception 'expected 7 Equipt inventory functions, found %', n;
  end if;
end $$;

-- crm_reconcile_invoice_payments: Landscapt, no Equipt role check.
do $$
declare
  def text := pg_get_functiondef('public.crm_reconcile_invoice_payments(uuid)'::regprocedure);
  blk text := E'  if public._role_write_blocked() then\n    raise exception ''Your role is read-only'' using errcode = ''42501'';\n  end if;\n\n';
begin
  if position(blk in def) = 0 then
    raise exception 'crm_reconcile_invoice_payments role check not found';
  end if;
  execute replace(def, blk, '');
end $$;

-- submit_for_approval: the viewer/requestor refusal applies to requisitions
-- and POs only.
do $$
declare
  def text := pg_get_functiondef('public.submit_for_approval(text, uuid)'::regprocedure);
  old_blk text := E'  -- Viewers are read-only; requestors may only keep requisitions in draft.\n  IF v_role IN (''viewer'', ''requestor'') THEN\n    RAISE EXCEPTION ''Your role can''''t submit records for approval'' USING ERRCODE = ''42501'';\n  END IF;\n';
  new_blk text := E'  -- Equipt viewers are read-only; requestors may only keep requisitions in\n  -- draft. (Estimate approvals follow the Landscapt role.)\n  IF v_role IN (''viewer'', ''requestor'') AND p_entity_type IN (''requisition'', ''purchase_order'') THEN\n    RAISE EXCEPTION ''Your role can''''t submit records for approval'' USING ERRCODE = ''42501'';\n  END IF;\n';
begin
  if position(old_blk in def) = 0 then
    raise exception 'submit_for_approval role check not found';
  end if;
  execute replace(def, old_blk, new_blk);
end $$;

-- Role write guards: Equipt tables only.
do $$
declare
  t record;
  equipt_tables text[] := array[
    'requisitions', 'requisition_line_items', 'purchase_orders', 'po_line_items',
    'goods_receipts', 'goods_receipt_lines', 'product_items',
    'work_orders', 'wo_parts', 'wo_labor_entries', 'wo_vendor_charges', 'maintenance_requests',
    'pm_schedules', 'pm_schedule_assets', 'pm_schedule_asset_parts', 'pm_schedule_parts',
    'pm_schedule_pauses', 'pm_schedule_cadence_history',
    'vehicles', 'assets', 'asset_parts', 'asset_status_history', 'parts', 'meters', 'meter_readings',
    'automations', 'vendors', 'approval_flows', 'approval_requests'];
  equipt_record_types text := '''po'', ''purchase_order'', ''requisition'', ''work_order'', ''receiving'', '
    '''vehicle'', ''request'', ''maintenance_request'', ''asset'', ''vendor'', ''pm_schedule'', ''part'', '
    '''product'', ''product_item'', ''meter''';
  role_expr text := 'coalesce((select public.my_role()), '''')';
  expr text;
  tbl text;
begin
  for t in
    select distinct tablename from pg_policies
     where schemaname = 'public' and policyname like 'role_write_guard_%'
       and tablename <> all (equipt_tables)
  loop
    execute format('drop policy if exists role_write_guard_ins on public.%I', t.tablename);
    execute format('drop policy if exists role_write_guard_upd on public.%I', t.tablename);
    execute format('drop policy if exists role_write_guard_del on public.%I', t.tablename);
  end loop;

  -- comments / attachments: the Equipt limits apply to Equipt records only.
  expr := format('coalesce(record_type, '''') not in (%2$s) or (%1$s <> ''viewer'' and (%1$s <> ''requestor'' or created_by = auth.uid()))',
                 role_expr, equipt_record_types);
  foreach tbl in array array['comments', 'attachments'] loop
    execute format('create policy role_write_guard_ins on public.%I as restrictive for insert with check (%s)', tbl, expr);
    execute format('create policy role_write_guard_upd on public.%I as restrictive for update using (%s) with check (%s)', tbl, expr, expr);
    execute format('create policy role_write_guard_del on public.%I as restrictive for delete using (%s)', tbl, expr);
  end loop;
end $$;
