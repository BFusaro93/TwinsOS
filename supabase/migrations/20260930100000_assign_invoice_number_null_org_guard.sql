-- assign_invoice_number() compared the invoice's org to my_org_id() with IS
-- DISTINCT FROM. For a nonexistent invoice id v_org is NULL, and for a
-- profileless authenticated user (client-portal / signup account) my_org_id()
-- is NULL too, so the guard passed and nextval() was consumed — a portal user
-- could burn invoice numbers in a loop. Fail closed on a NULL org instead.
-- CREATE OR REPLACE keeps the existing grants; the body is otherwise unchanged.
CREATE OR REPLACE FUNCTION public.assign_invoice_number(p_invoice_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num integer;
  v_org uuid;
BEGIN
  SELECT invoice_number, org_id INTO v_num, v_org FROM crm_invoices WHERE id = p_invoice_id;
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0
     AND (v_org IS NULL OR v_org IS DISTINCT FROM public.my_org_id()) THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = '42501';
  END IF;
  -- Only assign if not already set
  IF v_num IS NOT NULL THEN
    RETURN v_num;
  END IF;
  v_num := nextval('crm_invoices_number_seq');
  UPDATE crm_invoices SET invoice_number = v_num WHERE id = p_invoice_id;
  RETURN v_num;
END;
$function$;
