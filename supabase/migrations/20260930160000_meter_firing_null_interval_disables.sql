-- Meter automations: a consumed firing with no service interval disables
-- the rule instead of re-arming it at the same threshold.
--
-- release_meter_automation_firing() (20260928130200) re-armed a rule whose
-- trigger_config has no interval at its SAME threshold when its WO was
-- completed/skipped or its request rejected. A meter never drops back, so
-- the next 15-minute cron sweep fired it again: a duplicate WO after every
-- completion. The rule editor now requires an interval for >= meter rules;
-- rules already saved without one are switched off once their current
-- firing is consumed (they fire at most once more — never repeatedly).
-- `<=` rules keep re-arming: their condition clears on its own.
--
-- Re-stated from the only definition (20260928130200) with every guard kept:
-- latest-firing-only (60s skew), last_fired_at CAS, org match,
-- deleted_at/trigger_type filters, malformed-interval tolerance, and the
-- "undo" (delete) path still re-arming at the same threshold. Idempotent.

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

  if v_mode = 'consume' and v_interval is not null and v_interval > 0 and a.last_fired_value is not null then
    update automations
       set trigger_config  = v_tc || jsonb_build_object('threshold', a.last_fired_value + v_interval),
           pending_reset   = false,
           last_fired_at   = null,
           last_fired_value = null,
           updated_at      = now()
     where id = a.id and last_fired_at = a.last_fired_at;
  elsif v_mode = 'consume' and coalesce(v_tc ->> 'operator', '>=') = '>=' then
    -- No (usable) interval: there is no next threshold, and re-arming at the
    -- same one re-fires on the very next cron run (the meter is still past
    -- it) — a duplicate WO every 15 minutes after each completion. The
    -- service is done, so switch the rule off instead of re-arming.
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
