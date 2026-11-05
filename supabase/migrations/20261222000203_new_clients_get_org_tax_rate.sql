-- Settings → Accounting "Default Tax Rate" said it applies to new invoices and
-- estimates, but estimates and auto-invoices only read the client's own
-- default_tax_rate_bps, which defaults to 0 and was never stamped from the org.
-- Decision (2026-11): the company rate is stamped onto NEW clients as their
-- default, exactly like default_terms / invoice_frequency already are. A
-- tax-exempt client (is_taxable = false) stays at 0; an explicit non-zero rate
-- on the insert wins. Existing clients are deliberately not touched.
--
-- Note the column DEFAULT (0) is applied before a BEFORE INSERT trigger runs,
-- so "not given" and "0" can't be told apart here: a taxable new client at 0
-- gets the company rate. A client who should never be taxed is marked
-- tax-exempt.
--
-- Re-states set_client_defaults() in full from its live definition
-- (20260905170000_default_invoice_frequency_monthly.sql), adding only the tax stamp.

create or replace function public.set_client_defaults()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_org record;
begin
  select account_number_prefix, account_number_suffix, account_number_next,
         default_billing_terms, default_invoice_frequency, default_invoice_delivery,
         tax_rate_percent
    into v_org
    from public.organizations
   where id = new.org_id
   for update;

  if new.account_number is null and v_org is not null then
    new.account_number := coalesce(v_org.account_number_prefix, '')
      || v_org.account_number_next::text
      || coalesce(v_org.account_number_suffix, '');

    update public.organizations
       set account_number_next = account_number_next + 1
     where id = new.org_id;
  end if;

  if new.invoice_frequency is null then
    new.invoice_frequency := coalesce(v_org.default_invoice_frequency, 'monthly');
  end if;

  if new.invoice_delivery is null then
    new.invoice_delivery := coalesce(v_org.default_invoice_delivery, 'email');
  end if;

  if new.default_terms is null then
    new.default_terms := coalesce(v_org.default_billing_terms, 'due_on_receipt');
  end if;

  if new.is_taxable is not false
     and coalesce(new.default_tax_rate_bps, 0) = 0
     and coalesce(v_org.tax_rate_percent, 0) > 0 then
    new.default_tax_rate_bps := round(v_org.tax_rate_percent * 100)::integer;
  end if;

  return new;
end;
$$;
