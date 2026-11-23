-- Average Days to Pay: the report views had no link from an invoice to the date
-- it was actually paid. Add two columns to rpt_invoices (appended LAST, by
-- rewriting the live definition so every other column stays exactly as is):
--   paid_date   — date of the last payment applied to a fully paid invoice
--                 (crm_payments.invoice_id for single-invoice payments, plus
--                 crm_payment_allocations for multi-invoice ones). AR write-offs
--                 are not payments, so a written-off invoice has no paid date.
--   days_to_pay — paid_date minus invoice_date, floored at 0 (a prepayment
--                 taken before the invoice was cut counts as paid on day 0).
-- Both are NULL until the invoice is fully paid, so averages never mix in
-- open invoices.
do $$
declare
  v_def text;
  v_new text;
  v_paid text := $p$(
    SELECT max(x.pd) FROM (
      SELECT p.payment_date AS pd
        FROM crm_payments p
       WHERE p.invoice_id = i.id AND p.deleted_at IS NULL AND COALESCE(p.method, ''::text) <> 'AR Write-off'::text
      UNION ALL
      SELECT p.payment_date
        FROM crm_payment_allocations a
        JOIN crm_payments p ON p.id = a.payment_id
       WHERE a.invoice_id = i.id AND p.deleted_at IS NULL AND COALESCE(p.method, ''::text) <> 'AR Write-off'::text
    ) x
  )$p$;
begin
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.rpt_invoices'::regclass
             and a.attname = 'days_to_pay' and not a.attisdropped) then
    return;
  end if;
  v_def := rtrim(pg_get_viewdef('public.rpt_invoices'::regclass, true), E'; \n');
  v_new := regexp_replace(
    v_def,
    '(\s)FROM crm_invoices i',
    replace(
      E',\n    CASE WHEN i.status = \'paid\' AND i.balance_cents <= 0 THEN @PAID@ END AS paid_date,\n'
      || E'    CASE WHEN i.status = \'paid\' AND i.balance_cents <= 0 THEN GREATEST(0, @PAID@ - i.invoice_date) END AS days_to_pay',
      '@PAID@', v_paid
    ) || E'\\1FROM crm_invoices i'
  );
  if v_new = v_def then
    raise exception 'rpt_invoices definition not in the expected shape; days_to_pay not added';
  end if;
  execute 'create or replace view public.rpt_invoices with (security_invoker = on) as ' || v_new;
end $$;
