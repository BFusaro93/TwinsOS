-- Read-only (canceled subscription / expired trial) enforcement, re-run.
--
-- 20260926190000 added RESTRICTIVE insert/update/delete policies to every
-- org-scoped table that existed then and said to re-run its DO block for new
-- tables. Nobody did for ten later tables (equipment, sub-items, saved views,
-- reference library, asset status/cadence history...), so a read-only org
-- could still write to them. The migration-drift workflow now fails when a
-- table is missing these policies (see .github/workflows/migration-drift-check.yml).
--
-- The UPDATE policy also gains WITH CHECK. USING alone filters the target
-- rows out, so a read-only org's edit "succeeds" with 0 rows changed; WITH
-- CHECK can't make that error (the row is filtered first) but closes the case
-- of a row being moved into a read-only org. The app now gates writes on
-- useTrialStatus().isReadOnly and explains 42501s in read-only orgs.
--
-- support_messages, support_conversations and notifications stay writable so
-- a read-only org can still reach support.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.permissive = 'PERMISSIVE')
       AND c.relname NOT IN ('support_messages', 'support_conversations', 'notifications')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_ins ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_del ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY read_only_when_canceled_ins ON public.%I AS RESTRICTIVE FOR INSERT
                    WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE)', t.relname);
    EXECUTE format('CREATE POLICY read_only_when_canceled_upd ON public.%I AS RESTRICTIVE FOR UPDATE
                    USING ((SELECT my_org_is_read_only()) IS NOT TRUE)
                    WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE)', t.relname);
    EXECUTE format('CREATE POLICY read_only_when_canceled_del ON public.%I AS RESTRICTIVE FOR DELETE
                    USING ((SELECT my_org_is_read_only()) IS NOT TRUE)', t.relname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.organizations;
CREATE POLICY read_only_when_canceled_upd ON public.organizations AS RESTRICTIVE FOR UPDATE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE)
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);

-- Notifications: users only ever READ their own. Every writer is server-side
-- (service role); the one browser-side insert (WO part shortfall) moved to
-- /api/parts/shortfall-notify. The old FOR ALL policy also let a user insert,
-- update or delete rows addressed to themselves under any org_id.
DROP POLICY IF EXISTS users_own_notifications ON public.notifications;
DROP POLICY IF EXISTS users_read_own_notifications ON public.notifications;
CREATE POLICY users_read_own_notifications ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
