-- Tiered storm-depth pricing for "per_event_per_inch" snow billing — e.g.
-- 0-3in flat $X, 3-6in flat $Y, 12+in $D per inch. Previously this billing
-- type only supported a single flat rate-per-inch across the whole storm
-- depth; a job's tiers (if any) now take precedence in the snow invoicing
-- calculation, falling back to the flat rate_per_inch_cents when unset.
create table if not exists crm_snow_rate_tiers (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  job_id              uuid not null references crm_jobs(id) on delete cascade,
  sort_order          integer not null default 0,
  min_inches          numeric not null,
  -- null = open-ended top tier ("12+"), billed at rate_per_inch_cents * depth
  -- instead of a flat rate_cents.
  max_inches          numeric,
  rate_cents          integer,
  rate_per_inch_cents integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint crm_snow_rate_tiers_rate_check check (
    (max_inches is not null and rate_cents is not null) or
    (max_inches is null and rate_per_inch_cents is not null)
  )
);

create index if not exists crm_snow_rate_tiers_job_idx on crm_snow_rate_tiers(job_id, sort_order);

alter table crm_snow_rate_tiers enable row level security;

create policy "org members manage snow rate tiers"
  on crm_snow_rate_tiers
  for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
