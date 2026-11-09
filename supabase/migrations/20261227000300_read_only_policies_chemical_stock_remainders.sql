-- Read-only (canceled subscription / expired trial) policies for tables added since
-- 20261223000700 — crm_chemical_stock_remainders (20261224000100). Re-runs the DO block
-- from 20261220000600 unchanged (idempotent: drops and re-creates the three RESTRICTIVE
-- policies on every org-scoped table with RLS and a permissive policy). The table is
-- only written by sync_chemical_application_inventory (SECURITY DEFINER), so this is
-- for consistency and the migration-drift check.

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
