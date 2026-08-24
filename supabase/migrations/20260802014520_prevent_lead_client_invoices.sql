-- Leads must be converted to a client before they can be invoiced. Enforced
-- as a trigger (not just UI filtering) because crm_invoices rows are also
-- created by paths that never touch the client picker: the daily contract
-- billing cron (api/cron/contract-invoices), bulk invoice import, and snow
-- invoice generation. A DB-level check is the only place that catches all of
-- them.

CREATE OR REPLACE FUNCTION public.prevent_lead_client_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status text;
  v_name text;
BEGIN
  SELECT status, display_name INTO v_status, v_name
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_status = 'lead' THEN
    RAISE EXCEPTION 'Cannot create an invoice for %: it is still a lead. Convert it to a client first.', v_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_crm_invoices_prevent_lead ON public.crm_invoices;
CREATE TRIGGER trg_crm_invoices_prevent_lead
  BEFORE INSERT OR UPDATE OF client_id ON public.crm_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_lead_client_invoice();
