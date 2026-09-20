-- Address verification state for the three places a routable address is
-- entered by hand (see the "address verification at point of entry" spec in
-- TASKS.md, and resolveStopAddress in src/lib/utils/stop-address.ts).
--
-- Nothing in the app validates an address today, so a typo entered once is
-- routed to, navigated to and billed to forever. Two PROD jobs carried
-- "100/200 Northgate Pkwy, Plymouth MN" against clients reading
-- "100/200 Northgate Dr, Marlborough MA" and nothing could tell which was real.
--
-- lat/lng already exist on all three tables (clients + client_properties in
-- 20260906190001, crm_crews.starting_lat/lng in 20260706123936), so this only
-- adds the verdict and the timestamp. Storing them means an address that has
-- already been checked isn't re-checked on every save, and an "unverified
-- addresses" report can find the ones that still need a look.
--
-- verdict values, mirroring Google's Address Validation verdict plus our own
-- degraded/failure cases:
--   confirmed                    — every component confirmed
--   unconfirmed_but_plausible    — deliverable, some component inferred
--   unconfirmed_and_suspicious   — Google could not place it; probably a typo
--   partial_match                — from the Geocoding fallback, not Address Validation
--   not_found                    — Google returned ZERO_RESULTS
-- A NULL verdict means "never checked", which is distinct from "checked and bad".

alter table public.clients
  add column if not exists address_verdict     text,
  add column if not exists address_verified_at timestamptz;

alter table public.client_properties
  add column if not exists address_verdict     text,
  add column if not exists address_verified_at timestamptz;

alter table public.crm_crews
  add column if not exists address_verdict     text,
  add column if not exists address_verified_at timestamptz;

do $$
begin
  -- Guard the vocabulary, but leave NULL free so existing rows stay "never checked".
  if not exists (select 1 from pg_constraint where conname = 'clients_address_verdict_check') then
    alter table public.clients add constraint clients_address_verdict_check
      check (address_verdict is null or address_verdict in
        ('confirmed','unconfirmed_but_plausible','unconfirmed_and_suspicious','partial_match','not_found'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_properties_address_verdict_check') then
    alter table public.client_properties add constraint client_properties_address_verdict_check
      check (address_verdict is null or address_verdict in
        ('confirmed','unconfirmed_but_plausible','unconfirmed_and_suspicious','partial_match','not_found'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_crews_address_verdict_check') then
    alter table public.crm_crews add constraint crm_crews_address_verdict_check
      check (address_verdict is null or address_verdict in
        ('confirmed','unconfirmed_but_plausible','unconfirmed_and_suspicious','partial_match','not_found'));
  end if;
end $$;

comment on column public.clients.address_verdict is
  'Result of the last Google address check on service_address. NULL = never checked.';
comment on column public.client_properties.address_verdict is
  'Result of the last Google address check on address. NULL = never checked.';
comment on column public.crm_crews.address_verdict is
  'Result of the last Google address check on starting_address. NULL = never checked.';
