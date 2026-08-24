-- crm_jobs.budgeted_hours was only ever set once, at job creation, as
-- sum(service.budgeted_hours * team_size) (see useCreateClientJob). Nothing
-- kept it in sync afterwards: editing a service's own budgeted hours on the
-- Services tab (or adding/removing a service) never touched the job-level
-- total, so the two numbers silently drifted apart — exactly what happened
-- on a real package job where the office corrected the job-level total by
-- hand after forgetting to set per-service hours, leaving every service row
-- still at 0 even though the job "looked" budgeted.
--
-- Roll it up automatically via a trigger on crm_job_services, the same
-- pattern already used for crm_jobs.actual_hours (see
-- 20260726000000_crm_jobs_actual_hours_rollup.sql) rolling up from
-- crm_job_visits. crm_job_services is the right grain to sum from (not
-- crm_job_visits): package-job visits are linked 1:1 to a service via
-- job_service_id, but recurring-job visits are never linked to a service at
-- all (see generate-visits route) — crm_job_services is the one table that
-- exists, and is populated, for every job type.

create or replace function crm_recompute_job_budgeted_hours(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update crm_jobs
  set budgeted_hours = (
    select coalesce(sum(coalesce(s.budgeted_hours, 0) * coalesce(s.team_size, 1)), 0)
    from crm_job_services s
    where s.job_id = p_job_id
  )
  where id = p_job_id;
end;
$$;

create or replace function crm_job_services_recompute_budgeted_hours_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform crm_recompute_job_budgeted_hours(OLD.job_id);
    return OLD;
  end if;

  perform crm_recompute_job_budgeted_hours(NEW.job_id);
  if TG_OP = 'UPDATE' and OLD.job_id is distinct from NEW.job_id then
    perform crm_recompute_job_budgeted_hours(OLD.job_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_crm_job_services_recompute_budgeted_hours on crm_job_services;
create trigger trg_crm_job_services_recompute_budgeted_hours
after insert or delete or update of budgeted_hours, team_size, job_id
on crm_job_services
for each row execute function crm_job_services_recompute_budgeted_hours_trigger();

-- SECURITY DEFINER functions in the public schema auto-expose as callable
-- RPC endpoints otherwise; these are only ever meant to run via the trigger.
-- Revoke from anon/authenticated explicitly too — Supabase auto-grants
-- EXECUTE on new functions to those roles independent of the PUBLIC
-- pseudo-role, so revoking from PUBLIC alone doesn't remove it.
revoke execute on function crm_recompute_job_budgeted_hours(uuid) from public, anon, authenticated;
revoke execute on function crm_job_services_recompute_budgeted_hours_trigger() from public, anon, authenticated;

-- Backfill every existing job now, so jobs whose services already have
-- budgeted hours set (or already drifted, like the one that prompted this)
-- get corrected immediately instead of only after their next service edit.
update crm_jobs j
set budgeted_hours = (
  select coalesce(sum(coalesce(s.budgeted_hours, 0) * coalesce(s.team_size, 1)), 0)
  from crm_job_services s
  where s.job_id = j.id
)
where j.deleted_at is null;

-- rpt_job_visits fell back straight from the visit's own override to the
-- job-wide total, skipping the service level entirely — so a package
-- visit's own service (e.g. "Fert 2 of 5", now individually editable on the
-- Services tab) was ignored in favor of the coarser, diluted job total.
-- Add the service as a middle fallback tier via job_service_id (populated
-- for package-job visits; null for recurring, which correctly still falls
-- through to the job-level rollup above). The service tier must be
-- multiplied by its own team_size to match the units of the other two tiers
-- — v.budgeted_hours is entered directly as total crew-hours (e.g. via the
-- Dispatch Board), and j.budgeted_hours already has team_size baked in from
-- crm_recompute_job_budgeted_hours; s.budgeted_hours alone is per-person.
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
  coalesce(v.budgeted_hours, s.budgeted_hours * s.team_size, j.budgeted_hours) as budgeted_hours,
  calc.actual_hours,
  round(calc.actual_hours * coalesce(v.men_count, 1), 2) as man_hours,
  coalesce(v.rate_cents, j.rate_cents) as rate_cents,
  calc.revenue_cents,
  v.actual_labor_cost_cents,
  case
    when calc.actual_hours * coalesce(v.men_count, 1) > 0
    then round(calc.revenue_cents / (calc.actual_hours * coalesce(v.men_count, 1)))::int
  end as rev_per_man_hr_cents,
  round(coalesce(v.budgeted_hours, s.budgeted_hours * s.team_size, j.budgeted_hours, 0) - coalesce(calc.actual_hours, 0), 2) as variance_hours,
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
left join crm_job_services s on s.id = v.job_service_id
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
