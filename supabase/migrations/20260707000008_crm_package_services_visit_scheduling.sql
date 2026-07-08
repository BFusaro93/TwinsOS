-- Master Packages model a sequence of numbered visits (e.g. "Visit 1" .. "Visit 5"
-- for a 5-Step Fertilizer program), each tied to a specific service and its
-- own date window plus a minimum-days spacing rule from adjacent visits —
-- matching the Service Autopilot Master Package Editor. crm_package_services
-- previously only had visits_included (a count), with no per-visit date range
-- or spacing at all.

alter table crm_package_services
  add column if not exists name text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists min_days integer,
  add column if not exists default_b_hrs numeric,
  add column if not exists default_rate_cents integer;
