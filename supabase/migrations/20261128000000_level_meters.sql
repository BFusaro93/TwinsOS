-- Level meters (fuel / tank / fluid level) alongside cumulative meters
-- (odometer / hours).
--
--   * meters.kind: 'cumulative' (default; only counts up) or 'level'
--     (readings may go up or down; current_value = latest reading). Every
--     existing row stays cumulative.
--   * meters.capacity: optional max for a level meter (readings must stay
--     within 0..capacity). Null = no upper bound. Not allowed on cumulative.
--
-- Level-meter automation rules use operator '<' ("drops below"). They fire
-- once when the value goes below the threshold and re-arm only after the
-- value is back at/above it (the runner clears pending_reset), so
-- release_meter_automation_firing() must NOT re-arm a '<' rule just because
-- its work order was completed or its request rejected -- the tank may still
-- be low. Re-stated here from 20260930160000 with every guard kept: latest-
-- firing-only (60s skew), last_fired_at CAS, org match, deleted_at /
-- trigger_type filters, malformed-interval tolerance, '>=' no-interval
-- disable, and the "undo" (delete) path. Idempotent.

alter table public.meters
  add column if not exists kind text not null default 'cumulative',
  add column if not exists capacity numeric;

alter table public.meters drop constraint if exists meters_kind_check;
alter table public.meters
  add constraint meters_kind_check check (kind in ('cumulative', 'level'));

alter table public.meters drop constraint if exists meters_capacity_check;
alter table public.meters
  add constraint meters_capacity_check
  check (capacity is null or (kind = 'level' and capacity > 0));

create or replace function public.release_meter_automation_firing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a        automations%rowtype;
  v_mode   text;   -- 'consume' | 'undo'
  v_tc     jsonb;
  v_interval numeric;
begin
  if new.automation_id is null then
    return new;
  end if;

  if tg_table_name = 'work_orders' then
    if new.deleted_at is not null and old.deleted_at is null then
      v_mode := 'undo';
    elsif new.status in ('done', 'skipped') and old.status is distinct from new.status
          and old.status not in ('done', 'skipped') then
      v_mode := 'consume';
    end if;
  else -- maintenance_requests
    if new.deleted_at is not null and old.deleted_at is null and new.linked_work_order_id is null then
      v_mode := 'undo';
    elsif new.status = 'rejected' and old.status is distinct from 'rejected' and new.linked_work_order_id is null then
      v_mode := 'consume';
    end if;
  end if;
  if v_mode is null then
    return new;
  end if;

  select * into a from automations
   where id = new.automation_id
     and org_id = new.org_id
     and trigger_type = 'meter_threshold'
     and deleted_at is null
   for update;
  if not found or not a.pending_reset or a.last_fired_at is null then
    return new;
  end if;
  -- Only the latest firing's artifact releases it.
  if new.created_at < a.last_fired_at - interval '60 seconds' then
    return new;
  end if;

  v_tc := coalesce(a.trigger_config, '{}'::jsonb);

  -- Level rule ("drops below"): a completed / skipped / rejected firing does
  -- not re-arm it -- only the value rising back to >= threshold does (done by
  -- the runner). Deleting the firing's artifact still undoes it below.
  if v_mode = 'consume' and (v_tc ->> 'operator') = '<' then
    return new;
  end if;

  -- Never let a malformed config abort the user's status change.
  v_interval := case when (v_tc ->> 'interval') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
                     then (v_tc ->> 'interval')::numeric end;

  if v_mode = 'consume' and v_interval is not null and v_interval > 0 and a.last_fired_value is not null then
    update automations
       set trigger_config  = v_tc || jsonb_build_object('threshold', a.last_fired_value + v_interval),
           pending_reset   = false,
           last_fired_at   = null,
           last_fired_value = null,
           updated_at      = now()
     where id = a.id and last_fired_at = a.last_fired_at;
  elsif v_mode = 'consume' and coalesce(v_tc ->> 'operator', '>=') = '>=' then
    update automations
       set enabled         = false,
           pending_reset   = false,
           last_fired_at   = null,
           last_fired_value = null,
           updated_at      = now()
     where id = a.id and last_fired_at = a.last_fired_at;
  else
    update automations
       set pending_reset   = false,
           last_fired_at   = null,
           last_fired_value = null,
           updated_at      = now()
     where id = a.id and last_fired_at = a.last_fired_at;
  end if;
  return new;
end;
$$;

revoke all on function public.release_meter_automation_firing() from public, anon;

drop trigger if exists trg_work_orders_release_meter_firing on public.work_orders;
create trigger trg_work_orders_release_meter_firing
  after update of status, deleted_at on public.work_orders
  for each row execute function public.release_meter_automation_firing();

drop trigger if exists trg_maintenance_requests_release_meter_firing on public.maintenance_requests;
create trigger trg_maintenance_requests_release_meter_firing
  after update of status, deleted_at on public.maintenance_requests
  for each row execute function public.release_meter_automation_firing();
