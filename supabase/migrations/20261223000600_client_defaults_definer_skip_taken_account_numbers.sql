-- set_client_defaults() (BEFORE INSERT on clients) was SECURITY INVOKER and opened with
-- `select … from organizations … for update`. Under RLS a FOR UPDATE read is filtered by the
-- table's UPDATE policies too, and the only UPDATE policy on organizations requires a
-- company/crm/accounting settings permission. So for any user without one (Sales, Support,
-- Scheduler-type roles) the row came back empty and their new clients got no account number,
-- ignored the company's default terms / invoice frequency / invoice delivery, and missed the
-- company tax rate. Verified on TEST: a role with no settings permission inserted a client
-- with account_number NULL, due_on_receipt/monthly and 0 bps while the org was net_30/weekly/6.5%.
--
-- Fix: SECURITY DEFINER with a pinned search_path. It only reads and bumps new.org_id's own
-- organizations row; the clients INSERT policy (org_id = my_org_id()) still rejects a forged
-- org_id, and the whole statement (including the counter bump) rolls back with it.
--
-- Second fix in the same function: the generated number was prefix || account_number_next ||
-- suffix with no check that it was free. Imported (Settings → Import → Clients writes
-- account_number directly) or hand-typed account numbers that landed on the counter made every
-- later new client fail with unique_violation on clients_org_account_number_key. The generator
-- now steps forward past numbers a live client in the org already holds (the unique index is
-- partial on deleted_at is null, so deleted clients' numbers don't block reuse) — the same rule
-- assign_invoice_number uses — and leaves the counter just after the number it used, so the
-- walk past an imported block happens once.
--
-- A blank ('' / whitespace) account number is treated like "not given" so it gets a generated
-- number instead of colliding with the next blank one.
--
-- Re-states the full live body (20261222000203_new_clients_get_org_tax_rate.sql, identical on
-- TEST) — keeps the company tax-rate stamp.

create or replace function public.set_client_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org record;
  v_found boolean;
  v_next integer;
  v_candidate text;
begin
  select account_number_prefix, account_number_suffix, account_number_next,
         default_billing_terms, default_invoice_frequency, default_invoice_delivery,
         tax_rate_percent
    into v_org
    from public.organizations
   where id = new.org_id
   for update;
  v_found := found;

  if nullif(btrim(new.account_number), '') is null and v_found then
    v_next := v_org.account_number_next;
    loop
      v_candidate := coalesce(v_org.account_number_prefix, '')
        || v_next::text
        || coalesce(v_org.account_number_suffix, '');
      exit when not exists (
        select 1 from public.clients c
         where c.org_id = new.org_id
           and c.account_number = v_candidate
           and c.deleted_at is null
      );
      v_next := v_next + 1;
    end loop;

    new.account_number := v_candidate;

    update public.organizations
       set account_number_next = v_next + 1
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

-- Trigger-only function: nobody should call it directly (trigger firing doesn't check EXECUTE).
revoke all on function public.set_client_defaults() from public, anon, authenticated;
