-- Package step fixes (bug sweep round 4).
--
-- 1. Min Days spacing used Eastern time for a completed step's date while the
--    app (recalcNextPackageVisitDate) uses the org's own timezone. A Central /
--    Mountain / Pacific org completing a step late in the evening got the next
--    step pushed to a date this trigger then refused, so spacing silently
--    wasn't applied. Same function, org timezone.
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


-- 2. Package step visits created by Add Job and by estimate convert had no
--    occurrence_date, and the visit generator only treats a DELETED step visit
--    as "this step is handled" while it holds its occurrence — so deleting a
--    step visit (client opted out of Step 4) was undone by the daily cron. The
--    app now stamps it on insert; backfill the live ones (one per step, and
--    not where the step already has a row holding an occurrence, which the
--    unique index would refuse).
with candidates as (
  select v.id,
         coalesce(s.start_date, v.scheduled_date) as occ,
         row_number() over (partition by v.job_id, v.job_service_id order by v.created_at, v.id) as rn
  from crm_job_visits v
  join crm_jobs j on j.id = v.job_id
  join crm_job_services s on s.id = v.job_service_id
  where j.job_type = 'package'
    and v.deleted_at is null
    and v.occurrence_date is null
    and not v.crew_group_secondary
    and not exists (
      select 1 from crm_job_visits o
      where o.job_id = v.job_id
        and o.job_service_id = v.job_service_id
        and o.occurrence_date is not null
    )
)
update crm_job_visits v
set occurrence_date = c.occ
from candidates c
where v.id = c.id
  and c.rn = 1
  and c.occ is not null;

-- 3. Package Add Visit used the live-row count as the new step's sort_order,
--    which collides with the last step once a middle one is deleted; tied
--    steps have no defined order and Min Days is skipped between them.
--    Renumber the live steps of any package that has a tie.
with tied as (
  select package_id
  from crm_package_services
  where deleted_at is null
  group by package_id, sort_order
  having count(*) > 1
),
renumbered as (
  select ps.id, row_number() over (partition by ps.package_id order by ps.sort_order, ps.created_at, ps.id) - 1 as new_order
  from crm_package_services ps
  where ps.deleted_at is null
    and ps.package_id in (select package_id from tied)
)
update crm_package_services ps
set sort_order = r.new_order
from renumbered r
where ps.id = r.id
  and ps.sort_order is distinct from r.new_order;
