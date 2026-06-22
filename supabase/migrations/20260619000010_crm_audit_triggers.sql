-- Attach fn_audit_log triggers to CRM tables and extend the function to handle them.
-- Tables: clients, crm_tickets, crm_jobs, crm_invoices, estimates

CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ /* see migration body — full function replaced */ $$;

CREATE TRIGGER trg_clients_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_crm_tickets_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.crm_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_crm_jobs_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.crm_jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_crm_invoices_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.crm_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_estimates_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
