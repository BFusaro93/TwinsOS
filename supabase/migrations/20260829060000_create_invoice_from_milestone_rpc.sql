-- useCreateInvoiceFromMilestone (src/lib/hooks/use-estimate-milestones.ts) did
-- three separate client-side calls with no lock and no check that the
-- milestone wasn't already invoiced: insert crm_invoices, insert
-- crm_invoice_line_items, then update estimate_milestones.status='invoiced'.
-- A double-click, a second browser tab, or a retried request after a flaky
-- partial success could all read the same "not yet invoiced" milestone and
-- each create a full duplicate invoice for it before either write landed.
--
-- create_invoice_from_milestone() does the whole thing atomically: locks the
-- milestone row first (SELECT ... FOR UPDATE), raises if it's already
-- 'invoiced', then creates the invoice + line item and flips the milestone's
-- status — all inside one transaction, so a second concurrent caller either
-- serializes behind the first (and then sees status='invoiced' and raises)
-- or the whole thing rolls back together on any failure.

create or replace function public.create_invoice_from_milestone(
  p_milestone_id uuid,
  p_client_id    uuid,
  p_sales_rep_id uuid default null,
  p_po_number    text default null
)
returns table(invoice_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id      uuid;
  v_estimate_id uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_invoice_id  uuid;
begin
  select org_id, estimate_id, name, amount_cents, status
    into v_org_id, v_estimate_id, v_name, v_amount, v_status
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, sales_rep_id, description,
    invoice_date, po_number, subtotal_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), p_client_id, v_estimate_id, p_sales_rep_id, v_name,
    current_date, p_po_number, v_amount, v_amount, v_amount, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    invoice_id, name, description, qty, rate_cents, total_cents, sort_order
  ) values (
    v_invoice_id, v_name, '', 1, v_amount, v_amount, 0
  );

  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$$;
