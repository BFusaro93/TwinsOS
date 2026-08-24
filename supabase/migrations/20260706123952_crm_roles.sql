-- ── crm_roles ─────────────────────────────────────────────────────────────────

create table if not exists crm_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  description text,
  permissions jsonb not null default '{}',
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

create trigger set_crm_roles_updated_at
  before update on crm_roles
  for each row execute function set_updated_at();

alter table crm_roles enable row level security;

create policy "org members can view roles"
  on crm_roles for select using (org_id = my_org_id());

create policy "org members can insert roles"
  on crm_roles for insert with check (org_id = my_org_id());

create policy "org members can update roles"
  on crm_roles for update using (org_id = my_org_id());

-- Link employees to a CRM role
alter table crm_employees
  add column if not exists crm_role_id uuid references crm_roles(id) on delete set null;

-- Seed common roles for existing orgs
insert into crm_roles (org_id, name, description, permissions)
select
  id,
  r.name,
  r.description,
  '{}'::jsonb
from organizations
cross join (
  values
    ('Owner',            'Owner'),
    ('Operations Manager', 'Operations Manager'),
    ('Office Admin',     'Office Admin'),
    ('Crew Leader',      'Crew Leader'),
    ('Accounting',       'Accounting'),
    ('Sales / Account Mgr', 'Sales / Account Manager'),
    ('Scheduler',        'Scheduler'),
    ('Customer Support Rep', 'Customer Support Rep'),
    ('Fertilizer Tech',  'Fertilizer Technician')
) as r(name, description)
on conflict do nothing;
