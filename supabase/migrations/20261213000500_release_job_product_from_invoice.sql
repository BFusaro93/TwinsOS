-- Taking a billed material off its invoice, in one step.
--
-- Job Detail > Products lets the office move an "Invoiced" material to
-- Remove from Invoice (pending) / Used, do not Invoice / Not Used, Cancel.
-- The client used to do that in three writes: set_job_product_status (status +
-- stock restore, SECURITY DEFINER), then delete the invoice line and rewrite the
-- invoice totals from its own session. Since #406 the line delete needs
-- acct_add_modify_invoices, so for a Scheduler / Sales / CSR / Crew Leader the
-- first write committed and the second was refused: the material showed as
-- removed with its stock restored, the line stayed on the invoice, and the
-- customer was still billed for it — with "Remove from Invoice" no longer
-- offered to retry.
--
-- crm_release_job_product_from_invoice does all of it in one transaction:
--   * the material's status (and stock) via set_job_product_status, plus any
--     other material billed by the same line, back to pending
--   * the invoice line delete
--   * the invoice header totals, re-derived from the remaining lines exactly
--     as computeInvoiceTotals (src/lib/invoices/totals.ts) does, then the
--     payment reconcile for an invoice that has left draft
--
-- Who may:
--   * a DRAFT, unlocked invoice: any office CRM seat (has_crm_access, not
--     crew) — the same people who can manage job materials. Nothing has gone to
--     the customer yet.
--   * a printed / sent / paid ... invoice: acct_add_modify_invoices only.
--   * a locked invoice: nobody; unlock it first (unlocking needs the key).
-- Crew never reach this (their material transitions are pending -> resolved
-- only, enforced in set_job_product_status).

create or replace function public.crm_release_job_product_from_invoice(
  p_job_product_id uuid,
  p_new_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jp        record;
  v_inv       record;
  v_other     uuid;
  v_subtotal  integer;
  v_taxable   integer;
  v_raw_disc  integer;
  v_disc      integer;
  v_rate      integer;
  v_tax       integer;
  v_total     integer;
begin
  if p_new_status not in ('pending', 'used_no_invoice', 'not_used') then
    raise exception 'A material can only leave an invoice as pending, used (not invoiced) or not used';
  end if;

  if auth.uid() is null or coalesce(public.my_role(), '') = 'crew' or not public.has_crm_access() then
    raise exception 'You do not have permission to change job materials' using errcode = '42501';
  end if;

  select id, org_id, status, invoice_line_item_id
    into v_jp
    from public.crm_job_products
    where id = p_job_product_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Job product not found';
  end if;
  if public._org_mismatch(v_jp.org_id) then
    raise exception 'Unauthorized';
  end if;

  -- Not on an invoice (any more): an ordinary status change.
  if v_jp.status <> 'invoiced' or v_jp.invoice_line_item_id is null then
    perform public.set_job_product_status(p_job_product_id, p_new_status);
    update public.crm_job_products set invoice_line_item_id = null
      where id = p_job_product_id and invoice_line_item_id is not null;
    return null;
  end if;

  select i.id, i.org_id, i.status, i.locked, i.deleted_at
    into v_inv
    from public.crm_invoice_line_items li
    join public.crm_invoices i on i.id = li.invoice_id
    where li.id = v_jp.invoice_line_item_id
    for update of i;
  if not found then
    -- The line is gone; just free the material.
    perform public.set_job_product_status(p_job_product_id, p_new_status);
    update public.crm_job_products set invoice_line_item_id = null where id = p_job_product_id;
    return null;
  end if;
  if v_inv.org_id is distinct from v_jp.org_id then
    raise exception 'Unauthorized';
  end if;
  if v_inv.locked then
    raise exception 'This material is on a locked invoice. Unlock the invoice before changing it.';
  end if;
  if v_inv.deleted_at is null and v_inv.status <> 'draft'
     and not public.has_settings_permission('acct_add_modify_invoices') then
    raise exception 'This material is on an invoice that has already been printed or sent — only someone who can modify invoices can take it off'
      using errcode = '42501';
  end if;

  -- Every material billed by this line goes back with it (a line can carry
  -- more than one); the one the user picked gets the status they chose.
  for v_other in
    select id from public.crm_job_products
    where invoice_line_item_id = v_jp.invoice_line_item_id
      and id <> p_job_product_id
      and status = 'invoiced'
      and deleted_at is null
  loop
    perform public.set_job_product_status(v_other, 'pending');
  end loop;
  perform public.set_job_product_status(p_job_product_id, p_new_status);

  delete from public.crm_invoice_line_items where id = v_jp.invoice_line_item_id;
  -- ON DELETE SET NULL clears the link; stated anyway for a soft-deleted row.
  update public.crm_job_products set invoice_line_item_id = null
    where invoice_line_item_id = v_jp.invoice_line_item_id;

  if v_inv.deleted_at is not null or v_inv.status = 'void' then
    return v_inv.id;
  end if;

  -- Header totals from the remaining lines — computeInvoiceTotals, in SQL.
  select coalesce(sum(li.total_cents - coalesce(li.discount_cents, 0)), 0),
         coalesce(sum(li.total_cents - coalesce(li.discount_cents, 0)) filter (where li.is_taxable), 0)
    into v_subtotal, v_taxable
    from public.crm_invoice_line_items li
    where li.invoice_id = v_inv.id;

  select case when i.discount_type = 'percent'
              then round(greatest(0, v_subtotal)::numeric * coalesce(i.discount_value, 0) / 10000)::integer
              else coalesce(i.discount_cents, 0) end,
         least(greatest(0, coalesce(i.tax_rate_bps, 0)), 10000)
    into v_raw_disc, v_rate
    from public.crm_invoices i where i.id = v_inv.id;

  v_disc  := least(greatest(0, v_raw_disc), greatest(0, v_subtotal));
  v_tax   := round(greatest(0, v_taxable - v_disc)::numeric * v_rate / 10000)::integer;
  v_total := v_subtotal - v_disc + v_tax;

  update public.crm_invoices
     set subtotal_cents = v_subtotal,
         discount_cents = v_disc,
         tax_cents      = v_tax,
         total_cents    = v_total,
         balance_cents  = greatest(0, v_total - coalesce(amount_paid_cents, 0))
   where id = v_inv.id;

  -- A printed/sent/paid invoice's payments follow its new total (moves any
  -- overpayment to credit, re-syncs the client balance). The caller holds
  -- acct_add_modify_invoices here, which that RPC requires. A draft has no
  -- payments, so its balance above is already right.
  if v_inv.status <> 'draft' then
    perform public.crm_reconcile_invoice_payments(v_inv.id);
  end if;

  return v_inv.id;
end;
$$;

revoke all on function public.crm_release_job_product_from_invoice(uuid, text) from public, anon;
grant execute on function public.crm_release_job_product_from_invoice(uuid, text) to authenticated, service_role;
