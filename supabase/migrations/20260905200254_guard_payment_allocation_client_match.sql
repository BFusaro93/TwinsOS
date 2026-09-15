-- crm_payment_allocations only had org_id-scoped RLS (select/insert/update/
-- delete all check org_id = my_org_id()) — nothing stopped an allocation row
-- from referencing an invoice belonging to a completely unrelated client
-- within the same org, as long as the payment and invoice were both in that
-- org. That gap became real with cross-account payments: a payment can now
-- be recorded against a commercial parent client_id and its allocations can
-- legitimately reference either the parent's own invoices OR any of its
-- child sub-accounts' invoices (a property-manager parent paying several
-- HOAs' invoices with one check), but it must NOT be able to reference some
-- other, unrelated client's invoice.
--
-- Same two-layer enforcement pattern as guard_ticket_link_org_match() in
-- 20260901090000_guard_ticket_links_org_match.sql: RLS covers org isolation,
-- this BEFORE INSERT/UPDATE trigger covers the same-account relationship
-- that RLS can't express (it only sees this row's own org_id, not whether
-- invoice_id's client relates to payment_id's client).
--
-- NOTE: this migration must be applied to BOTH the prod and test Supabase
-- projects per this repo's documented dual-environment workflow — it is not
-- applied automatically by writing this file.

create or replace function public.guard_payment_allocation_client_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_client_id uuid;
  v_invoice_client_id uuid;
  v_invoice_parent_id uuid;
begin
  select client_id into v_payment_client_id
    from public.crm_payments
    where id = new.payment_id;

  if v_payment_client_id is null then
    raise exception 'payment_id must reference an existing payment';
  end if;

  select client_id into v_invoice_client_id
    from public.crm_invoices
    where id = new.invoice_id;

  if v_invoice_client_id is null then
    raise exception 'invoice_id must reference an existing invoice';
  end if;

  -- Same client — the common case (no hierarchy involved).
  if v_invoice_client_id = v_payment_client_id then
    return new;
  end if;

  -- Invoice's client is a child of the payment's client — the cross-account
  -- case (payment recorded against a parent, allocated to a child invoice).
  select parent_client_id into v_invoice_parent_id
    from public.clients
    where id = v_invoice_client_id;

  if v_invoice_parent_id is not distinct from v_payment_client_id then
    return new;
  end if;

  raise exception 'invoice_id must belong to the payment''s client or one of its child sub-accounts';
end;
$$;

drop trigger if exists trg_guard_payment_allocation_client_match on public.crm_payment_allocations;
create trigger trg_guard_payment_allocation_client_match
  before insert or update on public.crm_payment_allocations
  for each row execute function public.guard_payment_allocation_client_match();
