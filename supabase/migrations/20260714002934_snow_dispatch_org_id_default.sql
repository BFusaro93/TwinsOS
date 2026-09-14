-- Fix: crm_storm_events, crm_snow_routes, crm_snow_route_stops were created
-- without the `default my_org_id()` on org_id that every other org-scoped
-- table uses, so client inserts (which never set org_id explicitly) left it
-- null and got rejected by RLS ("new row violates row-level security policy").

ALTER TABLE public.crm_storm_events    ALTER COLUMN org_id SET DEFAULT my_org_id();
ALTER TABLE public.crm_snow_routes     ALTER COLUMN org_id SET DEFAULT my_org_id();
ALTER TABLE public.crm_snow_route_stops ALTER COLUMN org_id SET DEFAULT my_org_id();
