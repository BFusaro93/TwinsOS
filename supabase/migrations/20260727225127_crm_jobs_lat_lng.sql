-- Geocoded coordinates for a job's service address, cached once via the Geocoding
-- API so proximity checks (e.g. "which waiting-list jobs are near today's route")
-- are a free local haversine calc instead of a paid Distance Matrix call per check.
alter table crm_jobs
  add column if not exists lat double precision,
  add column if not exists lng double precision;
