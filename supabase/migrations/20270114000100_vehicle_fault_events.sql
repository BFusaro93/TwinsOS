-- Fault codes -> work orders.
--
-- 1) vehicle_fault_events: one row per fault code occurrence on a vehicle
--    (opened when Samsara first reports a confirmed/permanent code, cleared when
--    it stops reporting it; the same code coming back later is a NEW row). This
--    is what makes "new fault code" fire exactly once per occurrence instead of
--    every hour, and lets the Fault Codes card show the work order raised for it.
--    Written only by the service role (the hourly telematics cron and the tab's
--    refresh route).
-- 2) automations.trigger_type gains 'vehicle_fault_code' so the existing
--    Automations UI can create work orders / requests / notifications from it.

create table if not exists public.vehicle_fault_events (
  id                 uuid        primary key default gen_random_uuid(),
  org_id             uuid        not null default public.my_org_id() references public.organizations(id),
  vehicle_id         uuid        not null references public.vehicles(id),
  source             text        not null check (source in ('obdii', 'j1939')),
  code               text        not null,
  description        text,
  status             text        not null check (status in ('confirmed', 'pending', 'permanent')),
  check_engine_light boolean,
  first_seen_at      timestamptz not null default now(),
  cleared_at         timestamptz,
  work_order_id      uuid        references public.work_orders(id),
  created_by         uuid        references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

comment on table public.vehicle_fault_events is
  'One row per Samsara fault-code occurrence on a vehicle (open until cleared_at). Drives the vehicle_fault_code automation trigger and the Fault Codes card''s work-order link. Service-role writes only.';

-- At most one OPEN occurrence of a given code per vehicle.
create unique index if not exists vehicle_fault_events_open_key
  on public.vehicle_fault_events (vehicle_id, source, code)
  where cleared_at is null and deleted_at is null;
create index if not exists vehicle_fault_events_org_idx on public.vehicle_fault_events (org_id);
create index if not exists vehicle_fault_events_vehicle_idx on public.vehicle_fault_events (vehicle_id, first_seen_at desc);

drop trigger if exists trg_vehicle_fault_events_updated_at on public.vehicle_fault_events;
create trigger trg_vehicle_fault_events_updated_at
  before update on public.vehicle_fault_events
  for each row execute function public.set_updated_at();

alter table public.vehicle_fault_events enable row level security;

drop policy if exists "org_members_read_vehicle_fault_events" on public.vehicle_fault_events;
create policy "org_members_read_vehicle_fault_events" on public.vehicle_fault_events
  for select using (org_id = public.my_org_id() and deleted_at is null);

grant select on public.vehicle_fault_events to authenticated;

-- Read-only (canceled / expired trial) policies every org-scoped table needs.
drop policy if exists read_only_when_canceled_ins on public.vehicle_fault_events;
drop policy if exists read_only_when_canceled_upd on public.vehicle_fault_events;
drop policy if exists read_only_when_canceled_del on public.vehicle_fault_events;
create policy read_only_when_canceled_ins on public.vehicle_fault_events as restrictive for insert
  with check ((select my_org_is_read_only()) is not true);
create policy read_only_when_canceled_upd on public.vehicle_fault_events as restrictive for update
  using ((select my_org_is_read_only()) is not true)
  with check ((select my_org_is_read_only()) is not true);
create policy read_only_when_canceled_del on public.vehicle_fault_events as restrictive for delete
  using ((select my_org_is_read_only()) is not true);

-- New automation trigger.
alter table public.automations drop constraint if exists automations_trigger_type_check;
alter table public.automations add constraint automations_trigger_type_check
  check (trigger_type in (
    'meter_threshold', 'part_low_stock', 'pm_due', 'wo_overdue',
    'request_submitted', 'wo_status_change', 'po_status_change',
    'vehicle_fault_code'
  ));
