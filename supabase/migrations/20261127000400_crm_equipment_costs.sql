-- Equipment as an internal cost input, not a service.
--
-- Machines (Mini Ex, Dingo, Skid Steer) used to be modeled as flat-fee
-- services ("Bed Install - Mini Ex") because the estimate had no other place to
-- charge for them. Equipment is a cost of delivering a service, so:
--
--   crm_equipment                   org catalog: name + cost rate (per hour/day/flat)
--   crm_service_equipment           optional defaults on a service (pre-fill qty when the service is added)
--   estimate_line_item_equipment    equipment attached to ONE estimate line, a SNAPSHOT of
--                                   name/rate so later rate changes never rewrite old estimates
--
-- Equipment rows are internal: they roll into the line's cost (and so margin and
-- overhead) and are never rendered on the proposal, PDF, portal or invoice.

-- ============================================================
-- 1. Catalog
-- ============================================================
create table if not exists public.crm_equipment (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id) on delete cascade,
  name        text not null,
  description text,
  rate_cents  integer not null default 0 check (rate_cents >= 0),
  unit        text not null default 'day' check (unit in ('hour', 'day', 'flat')),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_crm_equipment_org_live
  on public.crm_equipment (org_id) where deleted_at is null;

-- ============================================================
-- 2. Service defaults
-- ============================================================
create table if not exists public.crm_service_equipment (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id() references organizations(id) on delete cascade,
  service_id   uuid not null references public.crm_services(id) on delete cascade,
  equipment_id uuid not null references public.crm_equipment(id) on delete cascade,
  default_qty  numeric(10,2) not null default 1 check (default_qty >= 0),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create unique index if not exists uq_crm_service_equipment_live
  on public.crm_service_equipment (service_id, equipment_id) where deleted_at is null;

-- ============================================================
-- 3. Equipment on an estimate line (snapshot)
-- ============================================================
create table if not exists public.estimate_line_item_equipment (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default my_org_id() references organizations(id) on delete cascade,
  line_item_id     uuid not null references public.estimate_line_items(id),
  equipment_id     uuid references public.crm_equipment(id) on delete set null,
  name             text not null,
  unit             text not null default 'day' check (unit in ('hour', 'day', 'flat')),
  qty              numeric(10,2) not null default 1 check (qty >= 0),
  rate_cents       integer not null default 0 check (rate_cents >= 0),
  total_cost_cents integer not null default 0 check (total_cost_cents >= 0),
  sort_order       integer not null default 0,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists idx_estimate_line_item_equipment_line
  on public.estimate_line_item_equipment (line_item_id) where deleted_at is null;

-- ============================================================
-- 4. RLS (org scope + has_crm_access gate, matching the other CRM tables)
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['crm_equipment', 'crm_service_equipment', 'estimate_line_item_equipment'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "org members manage %1$s" on public.%1$I for all using (org_id = my_org_id()) with check (org_id = my_org_id())',
      t
    );
    execute format(
      'create policy "require_crm_access" on public.%I as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access())',
      t
    );
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$I for each row execute function set_updated_at()',
      t
    );
  end loop;
end $$;
