-- pm_schedules.last_completed_date used to be stamped at WO *generation* time
-- (generate-wo route), so a schedule looked "completed" the day its work order
-- was merely created. Stamp it when a PM work order actually reaches 'done'.
--
-- Done as a trigger rather than in the status hook so every completion path
-- (web hook, crew app, API, automations) is covered.

create or replace function public.work_orders_sync_pm_last_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_date date;
begin
  if new.pm_schedule_id is null or new.status <> 'done' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'done' then
    return new;
  end if;

  -- Org-local calendar date of completion (completed_at is stamped by the
  -- BEFORE trigger trg_work_orders_stamp_completed_at).
  v_date := (coalesce(new.completed_at, now()) at time zone public.org_timezone(new.org_id))::date;

  update public.pm_schedules
     set last_completed_date = greatest(coalesce(last_completed_date, v_date), v_date)
   where id = new.pm_schedule_id
     and org_id = new.org_id;

  return new;
end;
$$;

revoke all on function public.work_orders_sync_pm_last_completed() from public, anon, authenticated;

drop trigger if exists trg_work_orders_sync_pm_last_completed on public.work_orders;
create trigger trg_work_orders_sync_pm_last_completed
  after insert or update of status on public.work_orders
  for each row execute function public.work_orders_sync_pm_last_completed();
