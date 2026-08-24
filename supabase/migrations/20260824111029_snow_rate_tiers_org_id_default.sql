-- Fix: crm_snow_rate_tiers (added 20260817000000_snow_rate_tiers.sql) was
-- created without the `default my_org_id()` on org_id that
-- 20260713000005_snow_dispatch_org_id_default.sql established as the fix for
-- every other snow-related org-scoped table (crm_storm_events,
-- crm_snow_routes, crm_snow_route_stops). use-snow-rate-tiers.ts's
-- useSaveSnowRateTiers always sets org_id explicitly from the parent job's
-- org_id before inserting, so this hasn't manifested as a user-visible
-- failure yet, but any insert path that omits org_id (e.g. if that lookup
-- ever returns no row) would hit a NOT NULL violation instead of falling
-- back to the authenticated user's org, same as the bug already fixed for
-- the sibling tables.

ALTER TABLE public.crm_snow_rate_tiers ALTER COLUMN org_id SET DEFAULT my_org_id();
