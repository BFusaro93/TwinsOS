-- A percent milestone stored amount_cents as a snapshot, written only when
-- someone edited its value field. The basis it was a percentage OF could move
-- afterwards -- which is exactly what a change order is -- and nothing
-- recomputed it.
--
-- The result: raise a project's contract price from $40k to $60k and the
-- Milestone tab DISPLAYS $18,000 for a 30% deposit (it recomputes for display)
-- while this function BILLED the stale $12,000. The screen and the invoice
-- disagreed, silently, and the underbill only surfaced at reconciliation.
--
-- Percent now means percent: the amount is resolved against the live basis at
-- the moment of invoicing, and written back so the row stops lying. Flat
-- milestones are a literal figure and are left exactly as entered.
--
-- Basis is project-first: once a milestone belongs to a project, the contract
-- price is the operational number and the estimate is history.

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
  v_project_id  uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_type        text;
  v_value       integer;
  v_basis       integer;
  v_invoice_id  uuid;
begin
  select org_id, estimate_id, project_id, name, amount_cents, status, milestone_type, milestone_value
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status, v_type, v_value
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

  -- A milestone invoiced from the estimate side still belongs to the project
  -- that estimate became, so the project's Billing tab and the WIP report see
  -- it without the user having to bill from the project specifically.
  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  -- Re-resolve a percentage against whatever the contract says right now.
  if v_type = 'percent' then
    if v_project_id is not null then
      select contract_price into v_basis from public.projects where id = v_project_id;
    else
      select total_cents into v_basis from public.estimates where id = v_estimate_id;
    end if;

    -- A zero/absent basis would silently bill $0. Keep the last known good
    -- snapshot instead, so a half-configured project can't erase an invoice.
    if coalesce(v_basis, 0) > 0 then
      v_amount := round(v_basis::numeric * v_value / 10000);
    end if;
  end if;

  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Milestone amount must be greater than zero';
  end if;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, po_number, subtotal_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), p_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    current_date, p_po_number, v_amount, v_amount, v_amount, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_amount, v_amount, 0
  );

  -- Write the resolved figure back so the schedule, the sums on it, and the
  -- invoice all report the same number afterwards.
  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$$;

revoke execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) to authenticated;
