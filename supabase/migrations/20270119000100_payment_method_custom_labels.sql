-- Payment methods: a fixed built-in set (crm_payments.method CHECK) plus org-defined custom
-- methods for tracking (Venmo, Zelle, Gift Card...). A custom method is stored as
-- method = 'Other' with the org's own name in method_label, so every report and Stripe/QuickBooks
-- rule that keys on `method` keeps working while the label is still reportable.
--
-- The org's crm_list_options 'payment_methods' list now holds ONLY custom methods. The built-ins
-- live in code (src/lib/payments/payment-methods.ts) and are shown read-only in settings, so the
-- old seeded copies (and any case-variant duplicates of them) are retired here. Rows with any other
-- value (an org's own Venmo / Square / Gift Card) are kept and become its custom methods.

alter table public.crm_payments add column if not exists method_label text;

alter table public.crm_payments drop constraint if exists crm_payments_method_label_check;
alter table public.crm_payments add constraint crm_payments_method_label_check
  check (method_label is null or (method = 'Other' and length(btrim(method_label)) between 1 and 60));

update public.crm_list_options
   set deleted_at = now()
 where list_name = 'payment_methods'
   and deleted_at is null
   and lower(btrim(value)) in (
     'ach/e-check', 'ar write-off', 'autopay', 'cash', 'check',
     'credit card- amex', 'credit card- discover', 'credit card- mastercard', 'credit card- visa',
     'debit card- discover', 'debit card- mastercard', 'debit card- visa',
     'other', 'account credit'
   );

-- Reports: expose the label (appended as the LAST column, after org_id, by rewriting the live definition).
do $$
declare
  v_def text;
  v_new text;
begin
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.rpt_payments'::regclass
             and a.attname = 'method_label' and not a.attisdropped) then
    return;
  end if;
  v_def := rtrim(pg_get_viewdef('public.rpt_payments'::regclass, true), E'; \n');
  v_new := regexp_replace(v_def, '(\s)FROM crm_payments p', E',\n    p.method_label AS method_label\\1FROM crm_payments p');
  if v_new = v_def then
    raise exception 'rpt_payments definition not in the expected shape; method_label not added';
  end if;
  execute 'create or replace view public.rpt_payments with (security_invoker = on) as ' || v_new;
end $$;
