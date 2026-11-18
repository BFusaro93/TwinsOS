-- Read-only (canceled subscription / expired trial) enforcement for the tables added since the
-- last backfill (20270107000300). The migration-drift check fails while a production table with
-- org_id + RLS lacks read_only_when_canceled_ins; automation_record_firings (per-record
-- automation firing log, 20270109001000) is the one that is missing. It is written only by the
-- service-role runner, so these RESTRICTIVE policies change nothing in practice; they just keep
-- every org-scoped table uniform. Same policies as the earlier backfills, applied only to tables
-- that don't have them yet, so re-running is harmless.

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
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname
                          AND p.policyname = 'read_only_when_canceled_ins')
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
