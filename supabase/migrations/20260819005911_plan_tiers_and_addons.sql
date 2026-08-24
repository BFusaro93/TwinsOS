-- Foundation for the 4-tier subscription model (Starter/CMMS/Growth/Enterprise)
-- and its a la carte add-ons (SMS, Job Photos, Client Portal, Route
-- Optimization, Advanced Reporting, API Access). Seat counts and overage
-- rates per plan live in code (src/lib/stripe/plans.ts) since they're the
-- same for every org on a given plan — these override columns exist only
-- for one-off custom Enterprise deals.

alter table organizations
  add column if not exists trial_ends_at timestamptz,
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists seats_included_override integer,
  add column if not exists seat_overage_cents_override integer;

alter table organizations
  add constraint organizations_billing_interval_check check (billing_interval in ('monthly', 'annual'));

-- Backfill existing trial orgs with a 30-day window from when they signed up,
-- so trial-length enforcement (added later) doesn't retroactively cut anyone
-- off mid-session the moment it ships.
update organizations
  set trial_ends_at = created_at + interval '30 days'
  where plan = 'trial' and trial_ends_at is null;

create table if not exists organization_addons (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references organizations(id) default my_org_id(),
  addon_key                   text not null check (addon_key in ('sms', 'job_photos', 'client_portal', 'route_optimization', 'advanced_reporting', 'api_access')),
  enabled                     boolean not null default false,
  stripe_subscription_item_id text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (org_id, addon_key)
);

create index if not exists idx_organization_addons_org on organization_addons (org_id);

alter table organization_addons enable row level security;

create policy "org members can read addons" on organization_addons
  for select using (org_id = my_org_id());

-- Writes only ever come from the billing checkout/webhook routes, which use
-- the service role (bypasses RLS) — no insert/update/delete policy for
-- regular authenticated users, matching the read-only pattern used for
-- other billing-derived state (e.g. stripe_connect_status on organizations).
