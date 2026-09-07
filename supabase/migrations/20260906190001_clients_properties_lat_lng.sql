-- Geocode cache for the address fallback chain used by
-- /api/crm/jobs/geocode (Dispatch Board → Nearby Waiting List, E-19).
--
-- Jobs created from the New Job / Convert Estimate dialogs carry no
-- service_address snapshot, so the route now falls back to the linked
-- client_properties row and then the client's service/billing address. The
-- resolved coordinates are cached on the job (crm_jobs.lat/lng, existing) and
-- on the row the address came from, so sibling jobs for the same
-- client/property skip the paid Geocoding lookup. Same shape as
-- 20260727225127_crm_jobs_lat_lng.sql.
alter table public.clients
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.client_properties
  add column if not exists lat double precision,
  add column if not exists lng double precision;
