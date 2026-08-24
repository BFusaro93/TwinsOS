-- 20260619000010_crm_audit_triggers.sql (never applied to prod) created audit
-- triggers on clients/crm_tickets/crm_jobs/crm_invoices/estimates. All but
-- crm_tickets already exist on prod (created directly, no surviving
-- migration file) — this adds the one that's actually missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_tickets_audit') THEN
    CREATE TRIGGER trg_crm_tickets_audit
      AFTER INSERT OR UPDATE OR DELETE ON public.crm_tickets
      FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
  END IF;
END $$;
