alter table clients
  add column if not exists cancellation_reason text,
  add column if not exists revenue_potential_cents integer not null default 0,
  add column if not exists do_not_market boolean not null default false,
  add column if not exists closed_at timestamptz;
