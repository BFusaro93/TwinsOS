-- Equipt PM parts + skipped work orders.
--
-- 1. A part may appear once per PM schedule (Parts tab) and once per schedule
--    asset. Duplicates made generation fail with a duplicate key on wo_parts
--    (one live line per part per work order). Existing duplicates are merged
--    into the oldest row (quantities summed) and the rest soft-deleted; partial
--    unique indexes then keep it that way. (The generate route also merges the
--    Parts-tab and asset copies of a part before inserting.)
-- 2. set_wo_part_stock takes no stock for a line on a skipped work order.

do $$
declare
  v_merged integer := 0;
  v_n integer;
begin
  with ranked as (
    select id, pm_schedule_id, part_id, quantity,
           row_number() over (partition by pm_schedule_id, part_id order by created_at, id) rn,
           sum(quantity) over (partition by pm_schedule_id, part_id) total
      from public.pm_schedule_parts
     where deleted_at is null and part_id is not null
  ), keep as (
    update public.pm_schedule_parts p set quantity = r.total
      from ranked r
     where p.id = r.id and r.rn = 1 and r.total <> p.quantity
       and exists (select 1 from ranked r2 where r2.pm_schedule_id = r.pm_schedule_id and r2.part_id = r.part_id and r2.rn > 1)
    returning 1
  ), drop_dupes as (
    update public.pm_schedule_parts p set deleted_at = now()
      from ranked r
     where p.id = r.id and r.rn > 1
    returning 1
  )
  select count(*) into v_n from drop_dupes;
  v_merged := v_merged + v_n;

  with ranked as (
    select id, pm_schedule_asset_id, part_id, quantity,
           row_number() over (partition by pm_schedule_asset_id, part_id order by created_at, id) rn,
           sum(quantity) over (partition by pm_schedule_asset_id, part_id) total
      from public.pm_schedule_asset_parts
     where deleted_at is null and part_id is not null
  ), keep as (
    update public.pm_schedule_asset_parts p set quantity = r.total
      from ranked r
     where p.id = r.id and r.rn = 1 and r.total <> p.quantity
       and exists (select 1 from ranked r2 where r2.pm_schedule_asset_id = r.pm_schedule_asset_id and r2.part_id = r.part_id and r2.rn > 1)
    returning 1
  ), drop_dupes as (
    update public.pm_schedule_asset_parts p set deleted_at = now()
      from ranked r
     where p.id = r.id and r.rn > 1
    returning 1
  )
  select count(*) into v_n from drop_dupes;
  v_merged := v_merged + v_n;

  raise notice 'pm part duplicates merged: %', v_merged;
end;
$$;

create unique index if not exists pm_schedule_parts_schedule_part_active_key
  on public.pm_schedule_parts (pm_schedule_id, part_id)
  where deleted_at is null and part_id is not null;

create unique index if not exists pm_schedule_asset_parts_asset_part_active_key
  on public.pm_schedule_asset_parts (pm_schedule_asset_id, part_id)
  where deleted_at is null and part_id is not null;

CREATE OR REPLACE FUNCTION public.set_wo_part_stock(p_wo_part_id uuid, p_target integer)
 RETURNS TABLE(old_qty integer, new_qty integer, requested_delta integer, applied_delta integer, quantity_deducted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_row        public.wo_parts%rowtype;
  v_deducted   integer;
  v_target     integer := greatest(0, coalesce(p_target, 0));
  v_req        integer;
  v_res        record;
  v_applied    integer := 0;
  v_old        integer;
  v_new        integer;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_row from public.wo_parts where id = p_wo_part_id for update;
  if not found then
    raise exception 'Work order part not found';
  end if;
  if public._equipt_org_mismatch(v_row.org_id) then
    raise exception 'Unauthorized';
  end if;

  -- A skipped work order holds no stock: wo_status_sync_part_stock returns its
  -- parts when it is skipped and takes them again when it is un-skipped. A
  -- part added or re-quantified while it is skipped used to be deducted anyway.
  if v_row.deleted_at is null
     and exists (select 1 from public.work_orders wo
                  where wo.id = v_row.work_order_id and wo.status = 'skipped') then
    v_target := 0;
  end if;

  v_deducted := coalesce(
    v_row.quantity_deducted,
    case when v_row.deleted_at is null then v_row.quantity else 0 end
  );

  if v_row.part_id is null then
    old_qty := null; new_qty := null;
    requested_delta := 0; applied_delta := 0;
    quantity_deducted := 0;
    return next;
    return;
  end if;

  v_req := v_deducted - v_target;

  if v_req <> 0 then
    select * into v_res
      from public.adjust_part_quantity(v_row.part_id, v_req, v_row.work_order_id);
    if found and v_res.applied_delta is not null then
      v_applied := v_res.applied_delta;
      v_old := v_res.old_qty;
      v_new := v_res.new_qty;
    end if;
    v_deducted := v_deducted - v_applied;
  end if;

  perform set_config('app.suppress_audit', 'true', true);
  update public.wo_parts set quantity_deducted = v_deducted where id = p_wo_part_id;
  perform set_config('app.suppress_audit', '', true);

  old_qty := v_old;
  new_qty := v_new;
  requested_delta := v_req;
  applied_delta := v_applied;
  quantity_deducted := v_deducted;
  return next;
end;
$function$;
