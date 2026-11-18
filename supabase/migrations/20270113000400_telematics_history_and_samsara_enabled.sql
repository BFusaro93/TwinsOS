-- 1) Fuel / battery history for the Telematics tab chart.
-- One row per vehicle per hour (recorded_at is truncated to the hour), written
-- ONLY by the service role: the hourly /api/cron/telematics-history job and the
-- tab's refresh route, which both upsert with ON CONFLICT DO NOTHING so the two
-- never double up. ~160k rows/yr for an 18-truck fleet (~30 MB).

create table if not exists public.vehicle_telematics_history (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null default public.my_org_id() references public.organizations(id),
  vehicle_id          uuid        not null references public.vehicles(id),
  recorded_at         timestamptz not null,
  fuel_percent        numeric(5,2),
  battery_milli_volts integer,
  engine_state        text        check (engine_state in ('Off', 'On', 'Idle')),
  created_by          uuid        references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint vehicle_telematics_history_vehicle_hour_key unique (vehicle_id, recorded_at)
);

comment on table public.vehicle_telematics_history is
  'Hourly fuel/battery samples per vehicle for the Telematics history chart. Service-role writes only.';

create index if not exists vehicle_telematics_history_org_idx
  on public.vehicle_telematics_history (org_id);

drop trigger if exists trg_vehicle_telematics_history_updated_at on public.vehicle_telematics_history;
create trigger trg_vehicle_telematics_history_updated_at
  before update on public.vehicle_telematics_history
  for each row execute function public.set_updated_at();

alter table public.vehicle_telematics_history enable row level security;

drop policy if exists "org_members_read_vehicle_telematics_history" on public.vehicle_telematics_history;
create policy "org_members_read_vehicle_telematics_history" on public.vehicle_telematics_history
  for select using (org_id = public.my_org_id() and deleted_at is null);

grant select on public.vehicle_telematics_history to authenticated;

-- Read-only (canceled / expired trial) policies every org-scoped table needs.
drop policy if exists read_only_when_canceled_ins on public.vehicle_telematics_history;
drop policy if exists read_only_when_canceled_upd on public.vehicle_telematics_history;
drop policy if exists read_only_when_canceled_del on public.vehicle_telematics_history;
create policy read_only_when_canceled_ins on public.vehicle_telematics_history as restrictive for insert
  with check ((select my_org_is_read_only()) is not true);
create policy read_only_when_canceled_upd on public.vehicle_telematics_history as restrictive for update
  using ((select my_org_is_read_only()) is not true)
  with check ((select my_org_is_read_only()) is not true);
create policy read_only_when_canceled_del on public.vehicle_telematics_history as restrictive for delete
  using ((select my_org_is_read_only()) is not true);

-- 2) Is Samsara switched on for the caller's org?
-- The integrations row (it holds the plaintext API key) is admin-only, so the
-- vehicle page can't read it to decide whether to show the Telematics tab.
-- This returns just the yes/no, never the key. No org (portal / profile-less
-- login) -> false.
create or replace function public.samsara_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.integrations i
     where i.org_id = public.my_org_id()
       and i.provider = 'samsara'
       and i.enabled
       and coalesce(btrim(i.api_key), '') <> ''
  );
$$;

revoke all on function public.samsara_enabled() from public, anon;
grant execute on function public.samsara_enabled() to authenticated;
