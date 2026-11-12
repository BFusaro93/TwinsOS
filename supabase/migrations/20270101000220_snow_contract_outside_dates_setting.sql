-- Snow contracts: what happens to a storm outside the contract dates.
--
-- crm_contracts.snow_outside_dates had two choices, and for a Monthly Flat Rate
-- snow job neither billed anything: Snow Invoicing dropped every flat-rate
-- visit and priced it $0, so "bill per event" silently never billed. It is now
-- a three-way setup choice:
--   dont_service   — the contract's snow jobs are not dispatched to a storm
--                    before the start date or after the end date
--   included       — dispatched, covered by the contract price (not billed)
--   bill_per_event — dispatched and billed per storm; a Monthly Flat Rate job
--                    bills snow_outside_event_price_cents (new), other billing
--                    types keep their own per-event / per-inch / hourly price.
--                    Snow Invoicing warns when the price is missing.
--
-- Existing rows keep their value ('bill_per_event' stays bill per event, with
-- no price set yet; 'included' stays included). Read by
-- src/lib/hooks/use-snow-invoicing.ts and use-snow-dispatch.ts.

alter table public.crm_contracts
  add column if not exists snow_outside_event_price_cents integer;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'crm_contracts_snow_outside_dates_check'
       and conrelid = 'public.crm_contracts'::regclass
  ) then
    alter table public.crm_contracts drop constraint crm_contracts_snow_outside_dates_check;
  end if;
  alter table public.crm_contracts
    add constraint crm_contracts_snow_outside_dates_check
    check (snow_outside_dates in ('dont_service', 'included', 'bill_per_event'));

  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_contracts_snow_outside_event_price_check'
       and conrelid = 'public.crm_contracts'::regclass
  ) then
    alter table public.crm_contracts
      add constraint crm_contracts_snow_outside_event_price_check
      check (snow_outside_event_price_cents is null or snow_outside_event_price_cents >= 0);
  end if;
end $$;

comment on column public.crm_contracts.snow_outside_dates is
  'Snow storms dated before start_date / after end_date: dont_service (not dispatched), included (covered by the contract price) or bill_per_event (billed per storm).';
comment on column public.crm_contracts.snow_outside_event_price_cents is
  'Snow, bill_per_event: what a Monthly Flat Rate snow job bills for each storm outside the contract dates (cents).';

notify pgrst, 'reload schema';
