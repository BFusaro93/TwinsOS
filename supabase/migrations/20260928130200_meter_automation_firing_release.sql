-- Meter automations: release a firing however its request / work order ends.
--
-- A meter_threshold automation fires once (pending_reset = true, remembering
-- last_fired_at / last_fired_value) and waits. Only the client hook
-- useUpdateWorkOrderStatus released it — and only when the WO went to done.
-- A rejected or deleted request, or a skipped or deleted WO, left the rule
-- stuck forever (meters only go up, so "wait for the meter to drop below the
-- threshold" never happens), and a WO completed through any other path (the
-- v1 API, bulk edits) never advanced the threshold.
--
-- This trigger is now the one place a firing is released. It acts only on
-- the request / WO from the rule's LATEST firing (created no earlier than
-- 60s before last_fired_at, allowing for clock skew), and only once (the
-- update is conditioned on last_fired_at being unchanged):
--
--   * WO done or skipped, request rejected   → the interval is consumed: the
--     threshold advances to last_fired_value + interval (when the rule has an
--     interval) and the rule re-arms. Skipped/rejected count as missed in PM
--     compliance, same as a time-based cycle that was skipped.
--   * request or WO deleted                  → the firing is undone: the rule
--     re-arms at the SAME threshold, so it fires again on the next reading.
--     (A deleted request whose WO exists is left to the WO.)
--
-- The hook's own threshold advance is removed in the same change.

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
  -- Never let a malformed config abort the user's status change.
  v_interval := case when (v_tc ->> 'interval') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
                     then (v_tc ->> 'interval')::numeric end;

  if v_mode = 'consume' and v_interval is not null and a.last_fired_value is not null then
    update automations
       set trigger_config  = v_tc || jsonb_build_object('threshold', a.last_fired_value + v_interval),
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
