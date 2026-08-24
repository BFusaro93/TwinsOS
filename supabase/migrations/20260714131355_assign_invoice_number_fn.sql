-- assign_invoice_number() + its backing sequence exist on the test project but
-- were never migrated to prod (same "created directly, no migration file"
-- drift pattern documented for other functions/tables). Discovered while
-- building Snow Invoicing: the RPC call in complete/route.ts and the new
-- useGenerateSnowInvoices hook both call this function without checking its
-- error, so on prod invoice_number silently stayed null for every
-- auto-generated invoice. Porting the exact live definition from test.

CREATE SEQUENCE IF NOT EXISTS public.crm_invoices_number_seq;

CREATE OR REPLACE FUNCTION public.assign_invoice_number(p_invoice_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_num integer;
BEGIN
  -- Only assign if not already set
  SELECT invoice_number INTO v_num FROM crm_invoices WHERE id = p_invoice_id;
  IF v_num IS NOT NULL THEN
    RETURN v_num;
  END IF;
  v_num := nextval('crm_invoices_number_seq');
  UPDATE crm_invoices SET invoice_number = v_num WHERE id = p_invoice_id;
  RETURN v_num;
END;
$function$;
