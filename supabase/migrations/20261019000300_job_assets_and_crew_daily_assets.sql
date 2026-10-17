-- Equipment for the day.
--
--   crm_job_assets         what a JOB needs the crew to bring (mower, trailer,
--                          aerator...). Rows reference the shared `assets`
--                          (CMMS) registry, so the same truck/trailer a crew is
--                          told to take is the one maintenance tracks.
--   crm_crew_daily_assets  which assets are physically ASSIGNED to which crew
--                          for one work date (the truck, the trailer, the
--                          mowers loaded that morning). Drives the shop-TV
--                          Crew Board and is the per-day equivalent of
--                          crm_crew_daily_members.
--
-- The Crew Board compares the two: assets a crew's jobs need vs. assets
-- actually loaded on that crew today.

create table if not exists public.crm_job_assets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references public.organizations(id),
  job_id      uuid not null references public.crm_jobs(id) on delete cascade,
  asset_id    uuid not null references public.assets(id),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  deleted_at  timestamptz
);

create unique index if not exists uq_crm_job_assets_job_asset
  on public.crm_job_assets (job_id, asset_id) where deleted_at is null;
create index if not exists idx_crm_job_assets_org_job
  on public.crm_job_assets (org_id, job_id) where deleted_at is null;
create index if not exists idx_crm_job_assets_asset
  on public.crm_job_assets (asset_id) where deleted_at is null;

create table if not exists public.crm_crew_daily_assets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references public.organizations(id),
  work_date   date not null,
  crew_id     uuid not null references public.crm_crews(id) on delete cascade,
  asset_id    uuid not null references public.assets(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  -- an asset can only be on one crew per day; moving it is an upsert
  unique (work_date, asset_id)
);

create index if not exists idx_crm_crew_daily_assets_org_date
  on public.crm_crew_daily_assets (org_id, work_date);
create index if not exists idx_crm_crew_daily_assets_crew
  on public.crm_crew_daily_assets (crew_id, work_date);

drop trigger if exists crm_job_assets_set_updated_at on public.crm_job_assets;
create trigger crm_job_assets_set_updated_at
  before update on public.crm_job_assets
  for each row execute function public.set_updated_at();

drop trigger if exists crm_crew_daily_assets_set_updated_at on public.crm_crew_daily_assets;
create trigger crm_crew_daily_assets_set_updated_at
  before update on public.crm_crew_daily_assets
  for each row execute function public.set_updated_at();

alter table public.crm_job_assets enable row level security;
alter table public.crm_crew_daily_assets enable row level security;

-- Permissive: same-org staff, never portal customers.
drop policy if exists "crm_job_assets_select" on public.crm_job_assets;
create policy "crm_job_assets_select" on public.crm_job_assets for select
  using (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_job_assets_insert" on public.crm_job_assets;
create policy "crm_job_assets_insert" on public.crm_job_assets for insert
  with check (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_job_assets_update" on public.crm_job_assets;
create policy "crm_job_assets_update" on public.crm_job_assets for update
  using (org_id = my_org_id() and not public.is_client_portal_user())
  with check (org_id = my_org_id());
-- No DELETE policy: soft deletes only (deleted_at).

drop policy if exists "crm_crew_daily_assets_select" on public.crm_crew_daily_assets;
create policy "crm_crew_daily_assets_select" on public.crm_crew_daily_assets for select
  using (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_crew_daily_assets_insert" on public.crm_crew_daily_assets;
create policy "crm_crew_daily_assets_insert" on public.crm_crew_daily_assets for insert
  with check (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_crew_daily_assets_update" on public.crm_crew_daily_assets;
create policy "crm_crew_daily_assets_update" on public.crm_crew_daily_assets for update
  using (org_id = my_org_id() and not public.is_client_portal_user())
  with check (org_id = my_org_id());
-- Per-day rows are pure assignment state (not history), so removing a row
-- from the board is a real delete, same as crm_crew_daily_members.
drop policy if exists "crm_crew_daily_assets_delete" on public.crm_crew_daily_assets;
create policy "crm_crew_daily_assets_delete" on public.crm_crew_daily_assets for delete
  using (org_id = my_org_id() and not public.is_client_portal_user());

-- Restrictive: CRM access + canceled-org read-only, same as other CRM tables.
drop policy if exists "require_crm_access" on public.crm_job_assets;
create policy "require_crm_access" on public.crm_job_assets
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());
drop policy if exists "require_crm_access" on public.crm_crew_daily_assets;
create policy "require_crm_access" on public.crm_crew_daily_assets
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());

drop policy if exists "read_only_when_canceled_ins" on public.crm_job_assets;
create policy "read_only_when_canceled_ins" on public.crm_job_assets
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.crm_job_assets;
create policy "read_only_when_canceled_upd" on public.crm_job_assets
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);

drop policy if exists "read_only_when_canceled_ins" on public.crm_crew_daily_assets;
create policy "read_only_when_canceled_ins" on public.crm_crew_daily_assets
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.crm_crew_daily_assets;
create policy "read_only_when_canceled_upd" on public.crm_crew_daily_assets
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_del" on public.crm_crew_daily_assets;
create policy "read_only_when_canceled_del" on public.crm_crew_daily_assets
  as restrictive for delete using ((select public.my_org_is_read_only()) is not true);

revoke all on public.crm_job_assets from anon;
revoke all on public.crm_crew_daily_assets from anon;
