-- Vehicles are a separate table from `assets` (the CMMS vehicle registry), so
-- the Crew Board's equipment tables must be able to point at either. Each row
-- references exactly one of asset_id / vehicle_id.

alter table public.crm_job_assets
  alter column asset_id drop not null,
  add column if not exists vehicle_id uuid references public.vehicles(id),
  add constraint crm_job_assets_one_equipment_chk check (num_nonnulls(asset_id, vehicle_id) = 1);
create unique index if not exists uq_crm_job_assets_job_vehicle
  on public.crm_job_assets (job_id, vehicle_id) where deleted_at is null and vehicle_id is not null;

alter table public.crm_crew_daily_assets
  alter column asset_id drop not null,
  add column if not exists vehicle_id uuid references public.vehicles(id),
  add constraint crm_crew_daily_assets_one_equipment_chk check (num_nonnulls(asset_id, vehicle_id) = 1),
  add constraint crm_crew_daily_assets_date_vehicle_key unique (work_date, vehicle_id);

alter table public.crm_crew_default_assets
  alter column asset_id drop not null,
  add column if not exists vehicle_id uuid references public.vehicles(id),
  add constraint crm_crew_default_assets_one_equipment_chk check (num_nonnulls(asset_id, vehicle_id) = 1),
  add constraint crm_crew_default_assets_vehicle_key unique (vehicle_id);

create index if not exists idx_crm_job_assets_vehicle on public.crm_job_assets (vehicle_id) where deleted_at is null;
