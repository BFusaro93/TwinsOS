-- Recovered from production: applied directly (no migration file ever
-- committed for it). Adds the audit trigger for crm_jobs specifically;
-- 20260619000010_crm_audit_triggers.sql's other four triggers (clients,
-- crm_tickets, crm_invoices, estimates) were likewise applied to prod
-- outside of any tracked migration, except crm_tickets — see
-- 20260824114303_crm_tickets_audit_trigger.sql, which was the one
-- genuinely still missing when this history was reconciled.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_jobs_audit') THEN
    CREATE TRIGGER trg_crm_jobs_audit
      AFTER INSERT OR UPDATE OR DELETE ON public.crm_jobs
      FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
  END IF;
END $$;
