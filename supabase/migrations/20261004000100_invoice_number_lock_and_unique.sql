-- Invoice numbering: serialise assignment per invoice, and enforce uniqueness.
--
-- assign_invoice_number() read invoice_number WITHOUT a row lock. Two concurrent
-- callers (e.g. the first-payment funnel in apply_payment_to_invoice and an
-- explicit save) both saw NULL, both called nextval(), and the first caller
-- returned a number that was then overwritten by the second — an activity-log /
-- email entry quoting an "Invoice #N" that no invoice carries. Locking the row
-- (FOR UPDATE) makes the second caller wait and then return the stored number.
-- Signature, null-org guard and grants are unchanged.
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
  SELECT invoice_number, org_id INTO v_num, v_org FROM crm_invoices WHERE id = p_invoice_id FOR UPDATE;
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

-- Uniqueness per org among live invoices. The header editor lets staff type a
-- number by hand, and the sequence is global, so nothing prevented duplicates.
-- Existing data may already contain duplicates (hand-typed numbers), and
-- renumbering is not allowed here, so the index is created ONLY when none exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.crm_invoices
    WHERE invoice_number IS NOT NULL AND deleted_at IS NULL
    GROUP BY org_id, invoice_number HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'crm_invoices has duplicate (org_id, invoice_number) rows; skipping unique index crm_invoices_org_number_unique. Resolve duplicates manually and re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_org_number_unique
      ON public.crm_invoices (org_id, invoice_number)
      WHERE invoice_number IS NOT NULL AND deleted_at IS NULL;
  END IF;
END
$$;
