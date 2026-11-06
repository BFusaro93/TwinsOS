-- Snow: per-push visits + storms outside a contract's dates.
--
-- 1. Per Push billing (crm_jobs.invoice_type = 'per_push_per_inch') bills
--    every push on its own depth, but crm_job_visits_job_storm_event_unique
--    allowed exactly one visit per job per storm, so a second push could not be
--    recorded at all. Each push is now its own visit on the same storm,
--    numbered by push_number (1 for the first dispatch). The unique index moves
--    to (job_id, storm_event_id, push_number), so the initial dispatch is still
--    deduplicated (every dispatched visit is push 1) and two dispatchers adding
--    "push 2" at once can't both land. A guard trigger keeps push 2+ to Per Push
--    jobs: a per-event / per-inch / hourly job still gets one visit per storm.
--
-- 2. crm_contracts.snow_outside_dates: whether a snow storm dated before the
--    contract's start date or after its end date is billed per event
--    ('bill_per_event', the default) or covered by the contract price
--    ('included'). Read by Snow Invoicing (src/lib/hooks/use-snow-invoicing.ts).

alter table public.crm_job_visits
  add column if not exists push_number integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_job_visits_push_number_check'
       and conrelid = 'public.crm_job_visits'::regclass
  ) then
    alter table public.crm_job_visits
      add constraint crm_job_visits_push_number_check check (push_number >= 1);
  end if;
end $$;

comment on column public.crm_job_visits.push_number is
  'Snow: which push of the storm this visit is (1 = the initial dispatch). Only Per Push jobs get push 2+.';

drop index if exists public.crm_job_visits_job_storm_event_unique;
create unique index if not exists crm_job_visits_job_storm_event_unique
  on public.crm_job_visits (job_id, storm_event_id, push_number)
  where storm_event_id is not null and deleted_at is null;

-- Push 2+ only for Per Push snow jobs on a storm. SECURITY INVOKER: the caller
-- can already see the job (it is inserting / editing a visit of it).
create or replace function public.crm_job_visits_push_number_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_type text;
begin
  if coalesce(new.push_number, 1) <= 1 then
    return new;
  end if;
  if new.storm_event_id is null then
    raise exception 'Only a storm visit can be an additional push.'
      using errcode = 'check_violation';
  end if;
  select invoice_type into v_invoice_type from crm_jobs where id = new.job_id;
  if coalesce(v_invoice_type, '') <> 'per_push_per_inch' then
    raise exception 'Only Per Push snow jobs can have more than one push per storm.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_job_visits_push_number_guard on public.crm_job_visits;
create trigger trg_crm_job_visits_push_number_guard
  before insert or update of push_number, storm_event_id, job_id on public.crm_job_visits
  for each row execute function public.crm_job_visits_push_number_guard();

revoke all on function public.crm_job_visits_push_number_guard() from public, anon;

alter table public.crm_contracts
  add column if not exists snow_outside_dates text not null default 'bill_per_event';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_contracts_snow_outside_dates_check'
       and conrelid = 'public.crm_contracts'::regclass
  ) then
    alter table public.crm_contracts
      add constraint crm_contracts_snow_outside_dates_check
      check (snow_outside_dates in ('bill_per_event', 'included'));
  end if;
end $$;

comment on column public.crm_contracts.snow_outside_dates is
  'Snow storms dated before start_date / after end_date: bill_per_event (default) or included in the contract price.';
