-- rpt_invoices.days_to_pay was floored at 0, so an invoice paid BEFORE its invoice date
-- (a prepayment / deposit) read as "paid in 0 days" and dragged every average down.
-- It is not a collection time at all, so report it as NULL (blank, excluded from averages).
-- Same-day payments stay 0. Idempotent; rewrites the live view definition in place.

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := rtrim(pg_get_viewdef('public.rpt_invoices'::regclass, true), E'; \n');
  if v_def !~ 'GREATEST\(0, \(\( SELECT max' then
    return; -- already converted
  end if;
  v_new := regexp_replace(
    v_def,
    'GREATEST\(0, (\(\( SELECT max\(x\.pd\) AS max.*?x\)\)) - i\.invoice_date\)(\s+ELSE NULL::integer\s+END AS days_to_pay)',
    'CASE WHEN \1 >= i.invoice_date THEN \1 - i.invoice_date END\2'
  );
  if v_new = v_def then
    raise exception 'rpt_invoices definition not in the expected shape; days_to_pay unchanged';
  end if;
  execute 'create or replace view public.rpt_invoices with (security_invoker = on) as ' || v_new;
end $$;
