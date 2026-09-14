-- Bug: the Snow Dispatch Board's storm-event "Complete" transition
-- (SnowDispatchBoard.tsx advanceStatus / the status dropdown) had no check
-- at all that every stop tied to the storm event was actually finished — a
-- storm event could be marked crm_storm_events.dispatch_status = 'complete'
-- while crm_job_visits rows tied to it (via storm_event_id) were still
-- 'scheduled', 'dispatched', or 'in_progress', silently hiding unfinished
-- plow/salt work. The client now blocks this too, but per this codebase's
-- two-layer enforcement pattern (see
-- 20260901131500_enforce_parent_wo_completion_gate.sql for the mirrored
-- approach on Work Orders), the DB must be the authoritative guard since any
-- direct write to crm_storm_events (another client, a future code path, an
-- RLS-permitted ad-hoc access) would otherwise bypass the UI-only check.
--
-- Only blocks the transition *into* 'complete'; all other dispatch_status
-- values and updates that don't change dispatch_status pass through
-- untouched.

create or replace function public.enforce_storm_event_completion_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_visits integer;
begin
  if new.dispatch_status = 'complete' and (old.dispatch_status is distinct from new.dispatch_status) then
    select count(*) into v_open_visits
    from public.crm_job_visits v
    where v.storm_event_id = new.id
      and v.deleted_at is null
      and v.status not in ('completed', 'skipped', 'cancelled');

    if v_open_visits > 0 then
      raise exception 'All stops must be completed or skipped before closing this storm event (% remaining).', v_open_visits
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_storm_event_completion_gate on public.crm_storm_events;

create trigger trg_enforce_storm_event_completion_gate
  before update on public.crm_storm_events
  for each row
  execute function public.enforce_storm_event_completion_gate();
