-- Snow contract caps, part 2: pushes and events caps + an explicit snow toggle.
--
--   covers_snow                  the contract includes snow service; turns on the
--                                snow settings (storms outside the dates, caps).
--                                Backfilled true for contracts that already have a
--                                linked snow job, a snow setting or a cap.
--   snow_pushes_cap              pushes (plow visits) covered per period; NULL = n/a
--   snow_events_cap              storm events covered per period; NULL = n/a
--   snow_overage_per_push_cents / snow_overage_per_event_cents
--
-- Every cap is optional ("not applicable" = NULL). Counting and pricing live in
-- src/lib/snow-caps.ts.

alter table public.crm_contracts
  add column if not exists covers_snow boolean not null default false,
  add column if not exists snow_pushes_cap integer,
  add column if not exists snow_events_cap integer,
  add column if not exists snow_overage_per_push_cents integer,
  add column if not exists snow_overage_per_event_cents integer;

update public.crm_contracts c
   set covers_snow = true
 where c.covers_snow = false
   and (
     exists (select 1 from public.crm_jobs j where j.contract_id = c.id and j.job_type = 'snow' and j.deleted_at is null)
     or c.snow_outside_event_price_cents is not null
     or c.snow_outside_dates in ('dont_service', 'included')
     or c.snow_inch_cap is not null
     or c.snow_salt_cap is not null
   );

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'crm_contracts_snow_caps_positive_check' and conrelid = 'public.crm_contracts'::regclass) then
    alter table public.crm_contracts drop constraint crm_contracts_snow_caps_positive_check;
  end if;
  alter table public.crm_contracts
    add constraint crm_contracts_snow_caps_positive_check check (
      (snow_inch_cap is null or snow_inch_cap > 0)
      and (snow_salt_cap is null or snow_salt_cap > 0)
      and (snow_pushes_cap is null or snow_pushes_cap > 0)
      and (snow_events_cap is null or snow_events_cap > 0)
      and (snow_overage_per_inch_cents is null or snow_overage_per_inch_cents >= 0)
      and (snow_overage_per_salt_cents is null or snow_overage_per_salt_cents >= 0)
      and (snow_overage_per_push_cents is null or snow_overage_per_push_cents >= 0)
      and (snow_overage_per_event_cents is null or snow_overage_per_event_cents >= 0)
    );
end $$;

comment on column public.crm_contracts.covers_snow is 'The contract includes snow service: shows the snow settings (storms outside the dates, caps and overage).';

-- Linking a snow job to a contract turns the contract's snow toggle on, so a
-- contract with a snow job never shows without its snow settings.
create or replace function public.crm_jobs_mark_contract_covers_snow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_type = 'snow' and new.contract_id is not null and new.deleted_at is null then
    update crm_contracts set covers_snow = true
     where id = new.contract_id and org_id = new.org_id and covers_snow = false;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_jobs_mark_contract_covers_snow() from public, anon, authenticated;

drop trigger if exists crm_jobs_mark_contract_covers_snow on public.crm_jobs;
create trigger crm_jobs_mark_contract_covers_snow
  after insert or update of contract_id, job_type on public.crm_jobs
  for each row execute function public.crm_jobs_mark_contract_covers_snow();
