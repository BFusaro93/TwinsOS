-- Crew load check-off: "this item is on the truck".
--
-- One row per (crew, day, item) while the item is checked as loaded; un-checking
-- deletes the row. Like crm_crew_daily_assets this is pure day-state, not history,
-- so a real delete is correct and a new day simply starts with no rows (the daily
-- reset needs no job).
--
-- item_key is the same key space the Crew Board uses for equipment —
-- 'vehicle:<uuid>' / 'asset:<uuid>' — plus 'product:<uuid>' for a material from the
-- day's load list.
--
-- Crew logins hold no table grants of their own: the crew app writes through
-- /api/crm/crew/load-checks (service client, caller's crew proven server-side).
-- Office users read and write directly, scoped to their org, for the Crew Board.

create table if not exists public.crm_crew_load_checks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references public.organizations(id),
  crew_id     uuid not null references public.crm_crews(id) on delete cascade,
  work_date   date not null,
  item_key    text not null check (item_key ~ '^(vehicle|asset|product):[0-9a-fA-F-]{36}$'),
  loaded_at   timestamptz not null default now(),
  loaded_by   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (org_id, crew_id, work_date, item_key)
);
create index if not exists idx_crm_crew_load_checks_org_date
  on public.crm_crew_load_checks (org_id, work_date);

alter table public.crm_crew_load_checks enable row level security;

drop policy if exists "crm_crew_load_checks_select" on public.crm_crew_load_checks;
create policy "crm_crew_load_checks_select" on public.crm_crew_load_checks for select
  using (org_id = my_org_id() and not public.is_client_portal_user() and coalesce(my_role(), '') <> 'crew');
drop policy if exists "crm_crew_load_checks_insert" on public.crm_crew_load_checks;
create policy "crm_crew_load_checks_insert" on public.crm_crew_load_checks for insert
  with check (org_id = my_org_id() and not public.is_client_portal_user() and coalesce(my_role(), '') <> 'crew');
drop policy if exists "crm_crew_load_checks_update" on public.crm_crew_load_checks;
create policy "crm_crew_load_checks_update" on public.crm_crew_load_checks for update
  using (org_id = my_org_id() and not public.is_client_portal_user() and coalesce(my_role(), '') <> 'crew')
  with check (org_id = my_org_id());
drop policy if exists "crm_crew_load_checks_delete" on public.crm_crew_load_checks;
create policy "crm_crew_load_checks_delete" on public.crm_crew_load_checks for delete
  using (org_id = my_org_id() and not public.is_client_portal_user() and coalesce(my_role(), '') <> 'crew');

drop policy if exists "require_crm_access" on public.crm_crew_load_checks;
create policy "require_crm_access" on public.crm_crew_load_checks
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());

drop policy if exists "read_only_when_canceled_ins" on public.crm_crew_load_checks;
create policy "read_only_when_canceled_ins" on public.crm_crew_load_checks
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.crm_crew_load_checks;
create policy "read_only_when_canceled_upd" on public.crm_crew_load_checks
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_del" on public.crm_crew_load_checks;
create policy "read_only_when_canceled_del" on public.crm_crew_load_checks
  as restrictive for delete using ((select public.my_org_is_read_only()) is not true);

revoke all on public.crm_crew_load_checks from anon;
