-- Level meters (fuel/tank) use meter_threshold automations with operator '<'
-- ("drops below"). Those are low-level alerts, not preventive maintenance, so
-- v_pm_outcomes must not score the work orders / maintenance requests they
-- create as PM units. Only the meter-rule joins change; columns are unchanged
-- so CREATE OR REPLACE VIEW keeps the existing grants and security_invoker.
-- Rewritten from the live definition so it stays correct however many times
-- the view has been replaced.
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.v_pm_outcomes'::regclass, true);
  v_new := replace(
    v_def,
    'a.trigger_type = ''meter_threshold''::text',
    '(a.trigger_type = ''meter_threshold''::text AND COALESCE(a.trigger_config ->> ''operator''::text, ''''::text) <> ''<''::text)'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'v_pm_outcomes: no meter_threshold join found to narrow';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_pm_outcomes WITH (security_invoker = on) AS ' || v_new;
END $$;

revoke all on public.v_pm_outcomes from anon;
grant select on public.v_pm_outcomes to authenticated;
