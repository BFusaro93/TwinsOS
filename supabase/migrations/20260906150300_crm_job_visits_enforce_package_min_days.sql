-- C-08: DB-level floor for package step spacing. crm_job_services.min_days on
-- a step means "at least N days after the PREVIOUS step" (see
-- computePackageVisitSchedule). The app checks this in
-- checkPackageMinDaysViolation (API PATCH / bulk-update routes and the
-- useUpdateVisit hook), but any path that writes scheduled_date directly
-- (SQL, a future route, an integration) would bypass it — so enforce it here
-- too on every scheduled_date change of a live package visit.
--
-- Baseline = the nearest earlier step's live visit: its completion date once
-- completed, otherwise its scheduled date. Cancelled / skipped / deleted
-- visits are ignored. Only the BACKWARD direction is enforced here on
-- purpose: recalcNextPackageVisitDate pushes later visits OUT after a
-- completion, and a forward check would make that completion path fail.

create or replace function crm_job_visits_enforce_package_min_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_svc       record;
  v_prev      record;
  v_baseline  date;
  v_earliest  date;
  v_step_no   integer;
  v_prev_no   integer;
begin
  if NEW.job_service_id is null or NEW.scheduled_date is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.scheduled_date is not distinct from OLD.scheduled_date then
    return NEW;
  end if;
  if NEW.deleted_at is not null or NEW.status in ('cancelled', 'skipped') then
    return NEW;
  end if;

  select s.id, s.job_id, s.sort_order, s.min_days, s.service_name
    into v_svc
  from crm_job_services s
  where s.id = NEW.job_service_id;

  if v_svc.id is null or coalesce(v_svc.min_days, 0) <= 0 then
    return NEW;
  end if;

  -- Nearest earlier step that has a live visit (prefer its completed visit).
  select s.id, s.service_name, s.sort_order, v.scheduled_date, v.completed_at, v.status
    into v_prev
  from crm_job_services s
  join crm_job_visits v
    on v.job_service_id = s.id
   and v.id <> NEW.id
   and v.deleted_at is null
   and v.status not in ('cancelled', 'skipped')
  where s.job_id = v_svc.job_id
    and s.sort_order < v_svc.sort_order
  order by s.sort_order desc,
           (v.status = 'completed') desc,
           v.completed_at desc nulls last,
           v.scheduled_date desc
  limit 1;

  if v_prev.id is null then
    return NEW;
  end if;

  v_baseline := case
    when v_prev.status = 'completed' and v_prev.completed_at is not null
      then (v_prev.completed_at at time zone 'America/New_York')::date
    else v_prev.scheduled_date
  end;
  v_earliest := v_baseline + v_svc.min_days;

  if NEW.scheduled_date < v_earliest then
    select count(*) + 1 into v_step_no from crm_job_services where job_id = v_svc.job_id and sort_order < v_svc.sort_order;
    select count(*) + 1 into v_prev_no from crm_job_services where job_id = v_svc.job_id and sort_order < v_prev.sort_order;
    raise exception 'Step % (%) must be at least % days after Step % (%) (earliest %)',
      v_step_no, coalesce(v_svc.service_name, 'step'), v_svc.min_days,
      v_prev_no, coalesce(v_prev.service_name, 'step'),
      to_char(v_earliest, 'FMMM/FMDD')
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_crm_job_visits_enforce_package_min_days on crm_job_visits;
create trigger trg_crm_job_visits_enforce_package_min_days
before update of scheduled_date
on crm_job_visits
for each row execute function crm_job_visits_enforce_package_min_days();

revoke execute on function crm_job_visits_enforce_package_min_days() from public, anon, authenticated;
