-- Default equipment per crew.
--
-- crm_crew_default_assets: the truck / trailer / mowers a crew normally runs.
-- An asset has at most one default crew. The Crew Board resolves an asset's
-- crew for a day as: that day's crm_crew_daily_assets row if there is one
-- (an override), otherwise its default crew.
--
-- crm_crew_daily_assets.crew_id becomes nullable so a day's row can also say
-- "this asset is deliberately NOT on any crew today" (e.g. the default truck
-- is in the shop) — otherwise there is no way to override a default away.

create table if not exists public.crm_crew_default_assets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references public.organizations(id),
  crew_id     uuid not null references public.crm_crews(id) on delete cascade,
  asset_id    uuid not null references public.assets(id),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  unique (asset_id)
);
create index if not exists idx_crm_crew_default_assets_org_crew
  on public.crm_crew_default_assets (org_id, crew_id);

alter table public.crm_crew_daily_assets alter column crew_id drop not null;

alter table public.crm_crew_default_assets enable row level security;

drop policy if exists "crm_crew_default_assets_select" on public.crm_crew_default_assets;
create policy "crm_crew_default_assets_select" on public.crm_crew_default_assets for select
  using (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_crew_default_assets_insert" on public.crm_crew_default_assets;
create policy "crm_crew_default_assets_insert" on public.crm_crew_default_assets for insert
  with check (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_crew_default_assets_update" on public.crm_crew_default_assets;
create policy "crm_crew_default_assets_update" on public.crm_crew_default_assets for update
  using (org_id = my_org_id() and not public.is_client_portal_user())
  with check (org_id = my_org_id());
-- Pure assignment state, not history: unpinning is a real delete (same as
-- crm_crew_daily_assets).
drop policy if exists "crm_crew_default_assets_delete" on public.crm_crew_default_assets;
create policy "crm_crew_default_assets_delete" on public.crm_crew_default_assets for delete
  using (org_id = my_org_id() and not public.is_client_portal_user());

drop policy if exists "require_crm_access" on public.crm_crew_default_assets;
create policy "require_crm_access" on public.crm_crew_default_assets
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());

drop policy if exists "read_only_when_canceled_ins" on public.crm_crew_default_assets;
create policy "read_only_when_canceled_ins" on public.crm_crew_default_assets
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.crm_crew_default_assets;
create policy "read_only_when_canceled_upd" on public.crm_crew_default_assets
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_del" on public.crm_crew_default_assets;
create policy "read_only_when_canceled_del" on public.crm_crew_default_assets
  as restrictive for delete using ((select public.my_org_is_read_only()) is not true);

revoke all on public.crm_crew_default_assets from anon;
