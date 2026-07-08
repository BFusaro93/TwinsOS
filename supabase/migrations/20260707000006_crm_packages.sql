-- crm_packages / crm_package_services existed on the test project (created
-- directly, no local migration file survives) but were missing entirely on
-- production, and both had org_id NOT NULL with no default — unlike every
-- other crm_* table — so PackageDialog's insert (which never sets org_id
-- explicitly) violated the NOT NULL constraint. That's the "failed to save
-- package" error.

create table if not exists crm_packages (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) default my_org_id(),
  name                  text not null,
  code                  text,
  description           text,
  monthly_amount_cents  integer not null default 0,
  season_months         integer not null default 12,
  visits_per_season     integer not null default 1,
  schedule_frequency    text not null default 'as_needed',
  schedule_days         text[] not null default '{}',
  is_active             boolean not null default true,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

alter table crm_packages alter column org_id set default my_org_id();
alter table crm_packages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'crm_packages' and policyname = 'org members manage packages') then
    create policy "org members manage packages"
      on crm_packages for all
      using (org_id = my_org_id())
      with check (org_id = my_org_id());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_crm_packages_updated_at') then
    create trigger set_crm_packages_updated_at
      before update on crm_packages
      for each row execute function set_updated_at();
  end if;
end $$;

create table if not exists crm_package_services (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) default my_org_id(),
  package_id       uuid not null references crm_packages(id) on delete cascade,
  service_id       uuid references crm_services(id) on delete set null,
  service_name     text not null,
  visits_included  integer not null default 1,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

alter table crm_package_services alter column org_id set default my_org_id();
alter table crm_package_services enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'crm_package_services' and policyname = 'org members manage package services') then
    create policy "org members manage package services"
      on crm_package_services for all
      using (org_id = my_org_id())
      with check (org_id = my_org_id());
  end if;
end $$;
