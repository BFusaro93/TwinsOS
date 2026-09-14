-- New clients were landing with invoice_frequency = 'daily' — an odd default for
-- a residential account — because organizations.default_invoice_frequency
-- defaulted to 'daily' and set_client_defaults() fell back to 'daily' too.
-- Switch both to 'monthly'. Existing orgs are deliberately NOT changed — an
-- org's explicit default is its own decision (change it under Settings →
-- Landscapt → Client defaults). Only the column default for new orgs and the
-- trigger fallback move. Existing client rows are NOT touched.
--
-- Applied to PROD and TEST on 2026-09-05 (TEST additionally had its existing
-- orgs flipped to 'monthly' by an earlier draft of this file; that was not
-- repeated on PROD).

alter table public.organizations
  alter column default_invoice_frequency set default 'monthly';

create or replace function public.set_client_defaults()
returns trigger
language plpgsql
as $$
declare
  v_org record;
begin
  select account_number_prefix, account_number_suffix, account_number_next,
         default_billing_terms, default_invoice_frequency, default_invoice_delivery
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

  return new;
end;
$$;
