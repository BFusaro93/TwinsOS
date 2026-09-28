-- ============================================================
-- Parts: keep cost_layers in step with quantity_on_hand.
--
-- 462 PROD parts (all orgs) had layer quantities that did not sum to
-- quantity_on_hand, because several paths changed the quantity without
-- touching the layers:
--   * adjust_part_quantity_manual (the stepper + part form),
--   * the parts CSV import (insert and update-by-part-number branches),
--   * useUpdatePart writing quantity_on_hand directly,
--   * creating a part with an opening quantity and no layers.
--
-- This migration:
--   1. zeroes the two sandbox parts sitting at -1 and adds
--      CHECK (quantity_on_hand >= 0);
--   2. re-states adjust_part_quantity_manual so it maintains layers
--      (increase -> append a layer at the part's current unit_cost,
--       decrease -> FIFO consume via decrement_cost_layers);
--   3. adds a BEFORE INSERT/UPDATE safety net on parts: when a write changes
--      quantity_on_hand but leaves cost_layers untouched, the same append /
--      FIFO-consume is applied, and an insert with an opening quantity gets an
--      opening layer. RPCs that already set cost_layers in the same UPDATE
--      (receive_part_quantity, correct_part_receipt, the 3-arg WO
--      adjust_part_quantity, this manual RPC) are left alone by it.
-- The 4-arg receiving adjust_part_quantity and correct_part_receipt are not
-- modified here.
-- Existing drift is repaired separately (repair_parts_layers.sql, not a
-- migration).
-- ============================================================

-- ── 1. negatives + CHECK ────────────────────────────────────────────────
do $$
begin
  perform set_config('app.suppress_parts_qty_audit', 'true', true);
  update public.parts
     set quantity_on_hand = 0
   where quantity_on_hand < 0
     and id in ('5902ca2b-edc1-4e3e-9383-dde82eff1827',
                '475af688-5b49-4a44-ba91-99602b9b13b4');
  -- any other negative (e.g. on TEST) would block the constraint the same way
  update public.parts set quantity_on_hand = 0 where quantity_on_hand < 0;
  perform set_config('app.suppress_parts_qty_audit', 'false', true);

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.parts'::regclass
       and conname = 'parts_quantity_on_hand_nonnegative'
  ) then
    alter table public.parts
      add constraint parts_quantity_on_hand_nonnegative check (quantity_on_hand >= 0);
  end if;
end;
$$;

-- ── 2. manual adjustment maintains layers ───────────────────────────────
create or replace function public.adjust_part_quantity_manual(p_part_id uuid, p_new_qty integer, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id     uuid;
  v_user_name   text;
  v_org_id      uuid;
  v_old_qty     integer;
  v_part_name   text;
  v_unit_cost   numeric;
  v_cost_layers jsonb;
  v_delta       integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for manual quantity adjustments';
  end if;

  if p_new_qty is null or p_new_qty < 0 then
    raise exception 'Quantity on hand cannot be negative';
  end if;

  select quantity_on_hand, name, org_id, unit_cost, cost_layers
    into v_old_qty, v_part_name, v_org_id, v_unit_cost, v_cost_layers
    from public.parts
   where id = p_part_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Part not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  if p_new_qty = v_old_qty then
    return;
  end if;

  v_delta := p_new_qty - v_old_qty;
  if v_delta > 0 then
    v_cost_layers := public.append_cost_layer(v_cost_layers, v_delta, v_unit_cost);
  else
    v_cost_layers := public.decrement_cost_layers(v_cost_layers, abs(v_delta));
  end if;

  select coalesce(name, email, id::text) into v_user_name
    from public.profiles
   where id = v_user_id
   limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
     set quantity_on_hand = p_new_qty,
         cost_layers      = v_cost_layers,
         updated_at       = now()
   where id = p_part_id;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
    v_user_name,
    v_part_name || ': quantity adjusted — ' || trim(p_reason),
    'quantity_on_hand', v_old_qty::text, p_new_qty::text
  );
end;
$function$;

revoke all on function public.adjust_part_quantity_manual(uuid, integer, text) from public, anon;
grant execute on function public.adjust_part_quantity_manual(uuid, integer, text) to authenticated, service_role;

-- ── 3. safety net for any other writer ──────────────────────────────────
create or replace function public.parts_sync_cost_layers()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_layers   jsonb;
  v_layer_sum numeric;
  v_delta    numeric;
begin
  v_layers := case when jsonb_typeof(NEW.cost_layers) = 'array' then NEW.cost_layers else '[]'::jsonb end;

  if TG_OP = 'INSERT' then
    -- An opening balance with no (or too few) layers gets one opening layer.
    select coalesce(sum((l ->> 'quantity')::numeric), 0) into v_layer_sum
      from jsonb_array_elements(v_layers) l;
    if coalesce(NEW.quantity_on_hand, 0) > v_layer_sum then
      NEW.cost_layers := v_layers || jsonb_build_array(jsonb_build_object(
        'id', 'layer-' || extract(epoch from clock_timestamp())::text || '-' || substr(gen_random_uuid()::text, 1, 8),
        'poNumber', 'opening-balance',
        'quantity', NEW.quantity_on_hand - v_layer_sum,
        'unitCost', coalesce(NEW.unit_cost, 0),
        'receivedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ));
    end if;
    return NEW;
  end if;

  -- UPDATE: only when quantity moved and the writer did not manage layers.
  if NEW.quantity_on_hand is distinct from OLD.quantity_on_hand
     and NEW.cost_layers is not distinct from OLD.cost_layers
  then
    v_delta := coalesce(NEW.quantity_on_hand, 0) - coalesce(OLD.quantity_on_hand, 0);
    if v_delta > 0 then
      NEW.cost_layers := public.append_cost_layer(v_layers, v_delta, coalesce(NEW.unit_cost, 0));
    elsif v_delta < 0 then
      NEW.cost_layers := public.decrement_cost_layers(v_layers, abs(v_delta));
    end if;
  end if;
  return NEW;
end;
$$;

revoke all on function public.parts_sync_cost_layers() from public, anon, authenticated;

drop trigger if exists trg_parts_sync_cost_layers on public.parts;
create trigger trg_parts_sync_cost_layers
  before insert or update of quantity_on_hand, cost_layers on public.parts
  for each row execute function public.parts_sync_cost_layers();
