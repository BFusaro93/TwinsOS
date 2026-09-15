-- crm_job_visits was never added to the supabase_realtime publication, so
-- the client portal's "live visit status" subscriptions (PortalDashboard.tsx,
-- PortalServicesPage.tsx) have been dead code since they were written — RLS
-- already has a working portal-scoped SELECT policy for this table (see
-- 20260825000000_client_portal_multi_org.sql), so the publication membership
-- was the only missing piece.
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_job_visits;
