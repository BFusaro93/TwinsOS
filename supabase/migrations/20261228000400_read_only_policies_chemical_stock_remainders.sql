-- Read-only (canceled / expired-trial) policies for a table that shipped without them.
--
-- 20261224000100_chemical_tracking_integrity.sql created crm_chemical_stock_remainders but, like the
-- ten tables 20261220000600 had to backfill, not the RESTRICTIVE read_only_when_canceled_* policies, so a
-- read-only org could still write to it. The migration-drift workflow's "every org-scoped table enforces
-- read-only mode" step fails on it for every PR until production has them.
--
-- Same statements as the DO block in 20261220000600, but limited to tables that are still missing the
-- policy, so tables that already have it are not dropped and recreated. Idempotent: a second run finds
-- nothing to do. The policies use the (SELECT ...) form, consistent with 20261228000300.
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
       AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'read_only_when_canceled_ins')
  LOOP
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
