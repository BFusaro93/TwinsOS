-- Let a scheduler dispatch a package step ahead of its Min Days spacing.
--
-- The spacing rule is enforced by crm_job_visits_enforce_package_min_days()
-- (and by checkPackageMinDaysViolation in the app). This adds a deliberate,
-- explicit way past it: crm_override_package_min_days() moves one visit to a
-- date while setting the transaction-local GUC app.package_min_days_override,
-- which the trigger honours. Same pattern as crm_override_invoiced_visit().
-- SECURITY INVOKER, so the update still runs under the caller's RLS (own org's
-- visits, CRM users only); the date change is audit-logged like any other.
--
-- Idempotent.

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
  -- A scheduler chose to dispatch ahead of Min Days on purpose
  -- (crm_override_package_min_days sets this for the one statement).
  if coalesce(current_setting('app.package_min_days_override', true), '') = 'on' then
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
      then (v_prev.completed_at at time zone org_timezone(NEW.org_id))::date
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

create or replace function public.crm_override_package_min_days(
  p_visit_id uuid,
  p_scheduled_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  perform set_config('app.package_min_days_override', 'on', true);

  update public.crm_job_visits
     set scheduled_date = p_scheduled_date,
         updated_at = now()
   where id = p_visit_id
     and deleted_at is null;
  get diagnostics v_count = row_count;

  perform set_config('app.package_min_days_override', '', true);

  if v_count = 0 then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.crm_override_package_min_days(uuid, date) from public, anon;
grant execute on function public.crm_override_package_min_days(uuid, date) to authenticated;
