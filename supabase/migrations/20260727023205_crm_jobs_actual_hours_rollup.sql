-- crm_jobs.actual_hours was read by every job-level report (Job Costing,
-- COGS, rpt_jobs, and anything built on it like production-rate accuracy)
-- but nothing anywhere ever wrote to it, so those reports always showed 0
-- regardless of what the dispatch board's per-visit "Actual" column
-- correctly displayed. Roll it up automatically via a trigger on
-- crm_job_visits, using the same fallback precedence the dispatch board's
-- computeActualHours() already uses: an explicit per-visit override, else
-- clock-in/out duration, else the dispatcher's Start/End time — each x the
-- visit's men_count (defaulting to 1 crew member if unset/zero).
--
-- A trigger (rather than updating crm_jobs.actual_hours from each write
-- path individually) keeps this correct regardless of which of the several
-- existing ways a visit gets updated — dispatch board row edits, the job
-- slideover's Appointment fields, Edit Job Times, or the crew tablet's
-- clock-in/out — without having to remember to touch it in all of them.

create or replace function crm_recompute_job_actual_hours(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update crm_jobs
  set actual_hours = (
    select coalesce(sum(
      coalesce(
        v.actual_hours,
        case
          when v.clocked_in_at is not null and v.clocked_out_at is not null
           and v.clocked_out_at > v.clocked_in_at
          then extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end,
        case
          when v.start_time is not null and v.end_time is not null
           and v.end_time > v.start_time
          then extract(epoch from (v.end_time - v.start_time)) / 3600.0
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end
      )
    ), 0)
    from crm_job_visits v
    where v.job_id = p_job_id
      and v.deleted_at is null
  )
  where id = p_job_id;
end;
$$;

create or replace function crm_job_visits_recompute_actual_hours_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform crm_recompute_job_actual_hours(OLD.job_id);
    return OLD;
  end if;

  perform crm_recompute_job_actual_hours(NEW.job_id);
  if TG_OP = 'UPDATE' and OLD.job_id is distinct from NEW.job_id then
    perform crm_recompute_job_actual_hours(OLD.job_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_crm_job_visits_recompute_actual_hours on crm_job_visits;
create trigger trg_crm_job_visits_recompute_actual_hours
after insert or delete or update of
  actual_hours, clocked_in_at, clocked_out_at, start_time, end_time, men_count, deleted_at, job_id
on crm_job_visits
for each row execute function crm_job_visits_recompute_actual_hours_trigger();

-- Both are SECURITY DEFINER and only ever meant to be called internally by
-- the trigger above — being in the public schema auto-exposes them as
-- callable RPC endpoints otherwise. Revoke from PUBLIC (not just
-- anon/authenticated) since new functions grant EXECUTE to PUBLIC by
-- default and anon/authenticated inherit through it — revoking only the
-- named roles leaves the PUBLIC grant still in effect.
revoke execute on function crm_recompute_job_actual_hours(uuid) from public;
revoke execute on function crm_job_visits_recompute_actual_hours_trigger() from public;

-- Backfill every existing job now, so already-completed visits are
-- reflected immediately instead of only after their next edit.
update crm_jobs j
set actual_hours = (
  select coalesce(sum(
    coalesce(
      v.actual_hours,
      case
        when v.clocked_in_at is not null and v.clocked_out_at is not null
         and v.clocked_out_at > v.clocked_in_at
        then extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0
           * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
      end,
      case
        when v.start_time is not null and v.end_time is not null
         and v.end_time > v.start_time
        then extract(epoch from (v.end_time - v.start_time)) / 3600.0
           * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
      end
    )
  ), 0)
  from crm_job_visits v
  where v.job_id = j.id and v.deleted_at is null
)
where j.deleted_at is null;

-- rpt_job_visits (feeds the Report Center's per-visit reports) was missing
-- the same third fallback tier — it already had explicit-override and
-- clock-in/out, but not Start/End time — so a visit with only a
-- dispatcher-entered Start/End (no clock punches yet) showed a blank
-- actual_hours here even though the dispatch board correctly computed one.
create or replace view rpt_job_visits
with (security_invoker = on) as
select
  v.id,
  v.scheduled_date,
  v.completed_at,
  v.status,
  v.sub_status,
  c.display_name as client_name,
  (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id) as service_names,
  cw.name as crew_name,
  sr.name as sales_rep,
  coalesce(v.men_count, 1) as men_count,
  coalesce(v.budgeted_hours, j.budgeted_hours) as budgeted_hours,
  calc.actual_hours,
  round(calc.actual_hours * coalesce(v.men_count, 1), 2) as man_hours,
  coalesce(v.rate_cents, j.rate_cents) as rate_cents,
  calc.revenue_cents,
  v.actual_labor_cost_cents,
  case
    when calc.actual_hours * coalesce(v.men_count, 1) > 0
    then round(calc.revenue_cents / (calc.actual_hours * coalesce(v.men_count, 1)))::int
  end as rev_per_man_hr_cents,
  round(coalesce(v.budgeted_hours, j.budgeted_hours, 0) - coalesce(calc.actual_hours, 0), 2) as variance_hours,
  j.service_city,
  j.service_zip,
  v.skip_reason,
  v.clocked_in_at,
  v.clocked_out_at,
  (select string_agg(distinct js.budget_method, ', ')
     from crm_job_services js where js.job_id = j.id) as budget_methods
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
left join crm_crews cw on cw.id = coalesce(v.crew_id, j.crew_id)
left join profiles sr on sr.id = j.sales_rep_id
cross join lateral (
  select
    coalesce(
      v.actual_hours,
      case when v.clocked_in_at is not null and v.clocked_out_at is not null
        then round((extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0)::numeric, 2)
      end,
      case when v.start_time is not null and v.end_time is not null and v.end_time > v.start_time
        then round((extract(epoch from (v.end_time - v.start_time)) / 3600.0)::numeric, 2)
      end
    ) as actual_hours,
    (coalesce(v.rate_cents, j.rate_cents, 0) * coalesce(nullif(v.qty, 0), 1))::int as revenue_cents
) calc
where v.deleted_at is null;
