-- Snow jobs: how an invoice type uses a job's service rows.
--
--   per_event_per_inch / per_push_per_inch  bill from the job's depth ranges (or
--       Rate Per Inch); a service row's price is never read, yet it rolls up into
--       crm_jobs.rate_cents / service_total_cents and inflates the job's reported
--       value. Only ONE service row makes sense (extra rows add nothing).
--   hourly   bills crm_jobs.rate_cents x hours, and rate_cents is the sum of the
--       service rows' qty x rate, so more than one row yields a wrong hourly rate.
--   monthly_flat_rate   bills from the linked contract; service prices are unread.
--   per_event   sums every service row (unchanged).
--
-- The New Job dialog and Job Detail enforce this in the UI; this is the backstop
-- for every other writer (API, Zapier, estimate conversion, imports).
--   * crm_job_services: a locked invoice type forces rate_cents to 0; a second
--     service row on a one-service type is rejected.
--   * crm_jobs: switching a snow job TO one of these types zeroes locked prices and
--     rejects the change if the job already has too many service rows.

create or replace function public.enforce_snow_job_service_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_type     text;
  v_invoice_type text;
  v_others       integer;
begin
  select j.job_type, j.invoice_type
    into v_job_type, v_invoice_type
    from public.crm_jobs j
   where j.id = new.job_id;

  if v_job_type is distinct from 'snow' then
    return new;
  end if;

  if v_invoice_type in ('per_event_per_inch', 'per_push_per_inch', 'monthly_flat_rate') then
    new.rate_cents := 0;
  end if;

  if v_invoice_type in ('per_event_per_inch', 'per_push_per_inch', 'hourly')
     and (tg_op = 'INSERT' or new.job_id is distinct from old.job_id) then
    select count(*) into v_others
      from public.crm_job_services s
     where s.job_id = new.job_id
       and s.id is distinct from new.id;
    if v_others >= 1 then
      raise exception 'A snow job billed "%" takes one service — create a separate job for each service', v_invoice_type
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists b_crm_job_services_enforce_snow_rules on public.crm_job_services;
create trigger b_crm_job_services_enforce_snow_rules
  before insert or update of job_id, rate_cents on public.crm_job_services
  for each row
  execute function public.enforce_snow_job_service_rules();

create or replace function public.enforce_snow_job_invoice_type_services()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_services integer;
begin
  if new.job_type is distinct from 'snow' then
    return new;
  end if;

  if new.invoice_type in ('per_event_per_inch', 'per_push_per_inch', 'hourly') then
    select count(*) into v_services from public.crm_job_services s where s.job_id = new.id;
    if v_services > 1 then
      raise exception 'This snow job has % services; "%" takes one service per job — split it into separate jobs first', v_services, new.invoice_type
        using errcode = '23514';
    end if;
  end if;

  if new.invoice_type in ('per_event_per_inch', 'per_push_per_inch', 'monthly_flat_rate') then
    update public.crm_job_services s
       set rate_cents = 0
     where s.job_id = new.id
       and coalesce(s.rate_cents, 0) <> 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_jobs_enforce_snow_invoice_type_services on public.crm_jobs;
create trigger trg_crm_jobs_enforce_snow_invoice_type_services
  after update of invoice_type, job_type on public.crm_jobs
  for each row
  when (new.invoice_type is distinct from old.invoice_type or new.job_type is distinct from old.job_type)
  execute function public.enforce_snow_job_invoice_type_services();

-- Trigger-only helpers — not RPCs.
revoke execute on function public.enforce_snow_job_service_rules() from public, anon, authenticated;
revoke execute on function public.enforce_snow_job_invoice_type_services() from public, anon, authenticated;

-- Backfill: clear service prices already on jobs whose invoice type never reads them
-- (the trigger above also recomputes the job's rolled-up value).
update public.crm_job_services s
   set rate_cents = 0
  from public.crm_jobs j
 where j.id = s.job_id
   and j.job_type = 'snow'
   and j.invoice_type in ('per_event_per_inch', 'per_push_per_inch', 'monthly_flat_rate')
   and coalesce(s.rate_cents, 0) <> 0;
