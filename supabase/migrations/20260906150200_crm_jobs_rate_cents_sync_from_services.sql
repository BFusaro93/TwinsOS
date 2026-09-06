-- C-03: crm_jobs.rate_cents is a creation-time snapshot of the job's price
-- (estimate conversion writes Σ service totals into it; the New Job dialog
-- leaves it null). Nothing kept it in sync with crm_job_services afterwards,
-- so re-pricing a service line left the dispatch-board AMT / costing panel
-- ($2,120) disagreeing with the Services table ($1,908).
--
-- Same rollup pattern as crm_jobs.budgeted_hours
-- (20260730150503_crm_jobs_budgeted_hours_rollup.sql): whenever a job has at
-- least one INCLUDED priced service, rate_cents = Σ included qty × rate_cents.
-- Jobs with no included services keep whatever rate_cents they have (that is
-- the only value they've got — e.g. API-created jobs with just a rate).

create or replace function crm_recompute_job_rate_cents(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_count integer;
begin
  select
    coalesce(sum(round(coalesce(s.qty, 1) * coalesce(s.rate_cents, 0)))::integer, 0),
    count(*)
  into v_total, v_count
  from crm_job_services s
  where s.job_id = p_job_id
    and coalesce(s.included, true);

  if v_count = 0 then
    return;
  end if;

  update crm_jobs
  set rate_cents = v_total
  where id = p_job_id
    and rate_cents is distinct from v_total;
end;
$$;

create or replace function crm_job_services_recompute_rate_cents_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform crm_recompute_job_rate_cents(OLD.job_id);
    return OLD;
  end if;

  perform crm_recompute_job_rate_cents(NEW.job_id);
  if TG_OP = 'UPDATE' and OLD.job_id is distinct from NEW.job_id then
    perform crm_recompute_job_rate_cents(OLD.job_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_crm_job_services_recompute_rate_cents on crm_job_services;
create trigger trg_crm_job_services_recompute_rate_cents
after insert or delete or update of qty, rate_cents, included, job_id
on crm_job_services
for each row execute function crm_job_services_recompute_rate_cents_trigger();

-- Trigger-only helpers — don't expose as RPC (see budgeted_hours rollup for why
-- both PUBLIC and the Supabase roles need revoking).
revoke execute on function crm_recompute_job_rate_cents(uuid) from public, anon, authenticated;
revoke execute on function crm_job_services_recompute_rate_cents_trigger() from public, anon, authenticated;

-- Backfill: bring already-drifted jobs into line (only jobs that have
-- included priced services; jobs without services are untouched).
update crm_jobs j
set rate_cents = t.total
from (
  select s.job_id,
         coalesce(sum(round(coalesce(s.qty, 1) * coalesce(s.rate_cents, 0)))::integer, 0) as total
  from crm_job_services s
  where coalesce(s.included, true)
  group by s.job_id
) t
where t.job_id = j.id
  and j.deleted_at is null
  and j.rate_cents is distinct from t.total;
