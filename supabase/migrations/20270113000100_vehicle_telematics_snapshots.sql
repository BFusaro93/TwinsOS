-- Latest Samsara telematics reading per vehicle (Equipt > Vehicles > Telematics tab).
--
-- One row per vehicle, overwritten each time someone opens the tab (the
-- /api/vehicles/[id]/telematics route refreshes it from Samsara). Values are
-- stored in Samsara's native units; the UI converts (kPa -> psi, mC -> F, ...).
-- A NULL value means the vehicle does not report that stat (e.g. chassis cabs
-- have no tire-pressure sensors, gas engines have no DEF).
--
-- Written ONLY by the service role (the route needs the org's admin-only
-- Samsara API key anyway), so there is deliberately no INSERT/UPDATE/DELETE
-- policy for authenticated users — same pattern as asset_status_history.

create table if not exists public.vehicle_telematics_snapshots (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null default public.my_org_id() references public.organizations(id),
  vehicle_id          uuid        not null references public.vehicles(id),
  samsara_vehicle_id  text,

  engine_state        text        check (engine_state in ('Off', 'On', 'Idle')),
  fuel_percent        numeric(5,2),
  battery_milli_volts integer,
  coolant_milli_c     integer,                    -- millidegrees Celsius
  def_milli_percent   integer,                    -- diesel exhaust fluid, 0-100000
  tire_front_left_kpa  integer,
  tire_front_right_kpa integer,
  tire_back_left_kpa   integer,
  tire_back_right_kpa  integer,

  check_engine_light  boolean,
  -- Normalised DTC list: [{ code, description, status, source }]
  fault_codes         jsonb       not null default '[]'::jsonb,

  -- When Samsara measured each stat: { engineState: iso, fuelPercent: iso, ... }
  stat_times          jsonb       not null default '{}'::jsonb,
  fetched_at          timestamptz not null default now(),

  created_by          uuid        references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  constraint vehicle_telematics_snapshots_vehicle_key unique (vehicle_id)
);

comment on table public.vehicle_telematics_snapshots is
  'Latest Samsara stats per vehicle, refreshed on demand by /api/vehicles/[id]/telematics. Native Samsara units; NULL = not reported by that vehicle. Service-role writes only.';

create index if not exists vehicle_telematics_snapshots_org_idx
  on public.vehicle_telematics_snapshots (org_id);

drop trigger if exists trg_vehicle_telematics_snapshots_updated_at on public.vehicle_telematics_snapshots;
create trigger trg_vehicle_telematics_snapshots_updated_at
  before update on public.vehicle_telematics_snapshots
  for each row execute function public.set_updated_at();

alter table public.vehicle_telematics_snapshots enable row level security;

drop policy if exists "org_members_read_vehicle_telematics_snapshots" on public.vehicle_telematics_snapshots;
create policy "org_members_read_vehicle_telematics_snapshots" on public.vehicle_telematics_snapshots
  for select using (org_id = public.my_org_id() and deleted_at is null);

grant select on public.vehicle_telematics_snapshots to authenticated;
