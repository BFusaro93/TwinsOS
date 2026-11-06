-- Read-only (canceled / expired) enforcement for two tables added after the
-- last backfill (20261220000600): crm_email_bounces and crm_sms_opt_outs.
-- The migration-drift check flagged them as missing the RESTRICTIVE
-- insert/update/delete policies. Same policies as the backfill DO block,
-- scoped to just these tables; idempotent.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_email_bounces', 'crm_sms_opt_outs'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_ins ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_del ON public.%I', t);
    EXECUTE format('CREATE POLICY read_only_when_canceled_ins ON public.%I AS RESTRICTIVE FOR INSERT
                    WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE)', t);
    EXECUTE format('CREATE POLICY read_only_when_canceled_upd ON public.%I AS RESTRICTIVE FOR UPDATE
                    USING ((SELECT my_org_is_read_only()) IS NOT TRUE)
                    WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE)', t);
    EXECUTE format('CREATE POLICY read_only_when_canceled_del ON public.%I AS RESTRICTIVE FOR DELETE
                    USING ((SELECT my_org_is_read_only()) IS NOT TRUE)', t);
  END LOOP;
END $$;
