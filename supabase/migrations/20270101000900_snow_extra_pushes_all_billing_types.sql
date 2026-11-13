-- Snow: any snow job can get another push on a storm, not just Per Push jobs.
--
-- Crews sometimes return to a site several times in one storm (a 2-4" pass that
-- isn't the final push). Every return needs its own visit so the clock-in/out,
-- depth, crew and notes are on record (liability timeline). Billing stays as
-- configured: Per Push and Hourly bill each visit; Per Event / Per Event Per
-- Inch bill the storm once, on the first push (extras are recorded at $0 — see
-- src/lib/snow-billing.ts isUnbilledExtraPush).
--
-- The unique index (job_id, storm_event_id, push_number) is unchanged. The guard
-- now only requires push 2+ to be a storm visit of a snow job.

create or replace function public.crm_job_visits_push_number_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job_type text;
begin
  if coalesce(new.push_number, 1) <= 1 then
    return new;
  end if;
  if new.storm_event_id is null then
    raise exception 'Only a storm visit can be an additional push.'
      using errcode = 'check_violation';
  end if;
  select job_type into v_job_type from crm_jobs where id = new.job_id;
  if coalesce(v_job_type, '') <> 'snow' then
    raise exception 'Only snow jobs can have more than one push per storm.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.crm_job_visits_push_number_guard() from public, anon;

comment on column public.crm_job_visits.push_number is
  'Snow: which push of the storm this visit is (1 = the initial dispatch). Any snow job can have push 2+; extras on per-event billing are recorded but not billed.';
