-- Fix cross-tenant RLS gap on maintenance_requests INSERT.
--
-- The original policy ("public_portal_insert_requests", WITH CHECK (true))
-- was written on the assumption that the only INSERT path was the public
-- portal route, which uses the service-role key and therefore bypasses RLS
-- entirely regardless of what the policy says.
--
-- In practice, the dashboard's "New Request" flow (useCreateRequest in
-- src/lib/hooks/use-requests.ts) inserts directly from the browser using the
-- authenticated user's own Supabase client — it relies on this same INSERT
-- policy. Because the policy had no org_id check, an authenticated user
-- could supply an arbitrary org_id in the insert payload and write a
-- maintenance_requests row into a DIFFERENT org's tenant (cross-tenant data
-- injection), violating the "org_id must always come from the authenticated
-- session" rule.
--
-- The service-role paths (/api/public/work-requests, and any future
-- server-side callers using the service role key) are unaffected: the
-- service role bypasses RLS entirely, so tightening this policy only
-- affects requests made with a user's own (anon-key + JWT) session.
-- /api/field/repair-request also stays unaffected since it inserts with
-- org_id resolved server-side from the caller's own profile row, which is
-- exactly what public.my_org_id() resolves to for that same user.

DROP POLICY IF EXISTS "public_portal_insert_requests" ON public.maintenance_requests;

CREATE POLICY "public_portal_insert_requests" ON public.maintenance_requests
  FOR INSERT WITH CHECK (org_id = public.my_org_id());
