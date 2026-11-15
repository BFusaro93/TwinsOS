-- Crew logins in Equipt: file repair requests and read asset / vehicle names,
-- nothing else (owner decision, bug sweep round 14, finding F1).
--
-- Crew are per-crew field logins (profiles.role = 'crew'). The Equipt shell
-- already sends them back to /home, but every Equipt table was open to them
-- through PostgREST: they could read labor rates and part costs, zero stock
-- through the stock RPCs, create assets and hard-delete work orders.
--
-- 1. _role_write_blocked() — re-stated from its LIVE definition with 'crew'
--    added. It backs _equipt_org_mismatch(), so every Equipt stock RPC
--    (adjust_part_quantity both overloads, adjust_part_quantity_manual,
--    set_wo_part_stock, receive_part_quantity, correct_part_receipt,
--    correct_product_receipt, log_receipt_without_stock,
--    receive_product_cost_layer, receive_product_receipt) now refuses a crew
--    JWT. The service-role exemption is kept. Crew job-material usage goes
--    through set_job_product_status → adjust_product_item_quantity, which does
--    not use this helper, so it is unaffected.
--
-- 2. RESTRICTIVE crew_no_access (all commands) on the CMMS tables crew never
--    use: work orders and their cost lines, parts, asset_parts, meters,
--    readings, PM schedules and their child tables, CMMS automations, asset
--    status history, and goods receipts (receiving moves stock and carries
--    prices). purchase_orders / po_line_items already exclude crew.
--
-- 3. assets / vehicles: crew keep SELECT (the field repair-request page lists
--    active asset / vehicle names) but can't insert, update or delete.
--
-- 4. maintenance_requests: crew keep INSERT (repair requests from
--    /photos/field/repair-request → /api/field/repair-request, which inserts
--    with the user's session and reads the new row back), see only their own
--    requests, and follow the requestor rule in
--    maintenance_requests_limited_role_guard (new requests start Open with no
--    triage fields; own request only, while still Open).
--
-- DEPLOY: BEFORE the code deploy. The live UI never sends crew into Equipt,
-- and the crew repair-request flow keeps working (proved on TEST).

-- ── 1. stock RPC guard ─────────────────────────────────────────────────────
create or replace function public._role_write_blocked()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(auth.role(), '') <> 'service_role'
     and coalesce(public.my_role(), '') in ('viewer', 'requestor', 'crew');
$function$;

-- ── 2. crew_no_access on CMMS tables ───────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'work_orders', 'wo_parts', 'wo_labor_entries', 'wo_vendor_charges',
    'parts', 'asset_parts', 'meters', 'meter_readings',
    'pm_schedules', 'pm_schedule_parts', 'pm_schedule_assets',
    'pm_schedule_asset_parts', 'pm_schedule_pauses', 'pm_schedule_cadence_history',
    'automations', 'asset_status_history',
    'goods_receipts', 'goods_receipt_lines'
  ] loop
    execute format('drop policy if exists crew_no_access on public.%I', t);
    execute format(
      'create policy crew_no_access on public.%I as restrictive for all to authenticated '
      || 'using (coalesce((select public.my_role()), '''') <> ''crew'') '
      || 'with check (coalesce((select public.my_role()), '''') <> ''crew'')',
      t
    );
  end loop;
end $$;

-- ── 3. assets / vehicles: read only for crew ───────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['assets', 'vehicles'] loop
    execute format('drop policy if exists crew_no_insert on public.%I', t);
    execute format('drop policy if exists crew_no_update on public.%I', t);
    execute format('drop policy if exists crew_no_delete on public.%I', t);
    execute format(
      'create policy crew_no_insert on public.%I as restrictive for insert to authenticated '
      || 'with check (coalesce((select public.my_role()), '''') <> ''crew'')', t);
    execute format(
      'create policy crew_no_update on public.%I as restrictive for update to authenticated '
      || 'using (coalesce((select public.my_role()), '''') <> ''crew'') '
      || 'with check (coalesce((select public.my_role()), '''') <> ''crew'')', t);
    execute format(
      'create policy crew_no_delete on public.%I as restrictive for delete to authenticated '
      || 'using (coalesce((select public.my_role()), '''') <> ''crew'')', t);
  end loop;
end $$;

-- ── 4. maintenance_requests: crew see only their own ───────────────────────
drop policy if exists crew_own_requests_only on public.maintenance_requests;
create policy crew_own_requests_only on public.maintenance_requests
  as restrictive for select to authenticated
  using (
    coalesce((select public.my_role()), '') <> 'crew'
    or created_by = (select auth.uid())
    or requested_by_id = (select auth.uid())
  );

-- Re-stated from the LIVE definition; only change: 'crew' joins the limited
-- roles (requestor, purchaser).
create or replace function public.maintenance_requests_limited_role_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_role text;
begin
  if not public._crm_direct_user_write() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Any role: a request already linked to a work order keeps its status.
  if tg_op = 'UPDATE'
     and old.linked_work_order_id is not null
     and new.status is distinct from old.status then
    raise exception 'This request is linked to work order % — its status can''t be changed.',
      coalesce(old.linked_work_order_number, '')
      using errcode = '42501';
  end if;

  v_role := coalesce(public.my_role(), '');
  if v_role not in ('requestor', 'purchaser', 'crew') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'open'
       or new.automation_id is not null
       or new.linked_work_order_id is not null
       or new.linked_work_order_number is not null
       or new.assigned_to_id is not null
       or new.assigned_to_name is not null then
      raise exception 'New requests start as Open; review fields are set by whoever triages requests.'
        using errcode = '42501';
    end if;
    if new.requested_by_id is not null and new.requested_by_id is distinct from auth.uid() then
      raise exception 'You can only submit requests as yourself.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE / DELETE: own request, still open, not already deleted.
  if not (old.created_by = auth.uid() or old.requested_by_id = auth.uid()) then
    raise exception 'You can only change your own requests.' using errcode = '42501';
  end if;
  if old.status is distinct from 'open' or old.deleted_at is not null then
    raise exception 'This request is already being reviewed and can no longer be changed or deleted.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if public._crm_changed_outside(
       to_jsonb(old), to_jsonb(new),
       array['title', 'description', 'priority', 'asset_id', 'asset_name', 'deleted_at']
     ) then
    raise exception 'You can change only the title, description, priority and asset/vehicle of your request.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
