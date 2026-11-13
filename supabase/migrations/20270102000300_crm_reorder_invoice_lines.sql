-- Reorder an invoice's line items in one statement.
--
-- Invoice lines print (screen, PDF, email, online invoice page, QuickBooks)
-- in crm_invoice_line_items.sort_order. The editor sends the full line list
-- in the desired order; this rewrites sort_order to 0..n-1 for every line of
-- the invoice in a single UPDATE, so a failure can't leave duplicate or
-- partial orders. It changes nothing else: amounts, tax, visit_id and
-- job-product links are untouched, so no totals recalculation is needed.
--
-- SECURITY INVOKER: RLS scopes the rows to the caller's org, and the
-- crm_invoice_line_items lock trigger still fires on the UPDATE as a backstop.
-- The acct_add_modify_invoices key is enforced here (service-role and
-- in-database callers are exempt, like the other money RPCs).

create or replace function public.crm_reorder_invoice_lines(p_invoice_id uuid, p_line_ids uuid[])
returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_inv      record;
  v_existing integer;
  v_matched  integer;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to edit invoices' using errcode = '42501';
  end if;

  select id, locked, status, deleted_at into v_inv
    from public.crm_invoices where id = p_invoice_id;
  if not found or v_inv.deleted_at is not null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if coalesce(v_inv.locked, false) then
    raise exception 'This invoice is locked and cannot be edited. Unlock it first.' using errcode = 'P0001';
  end if;
  if v_inv.status = 'void' then
    raise exception 'A void invoice cannot be edited.' using errcode = 'P0001';
  end if;

  -- The list must be exactly this invoice's lines, each once: a stale client
  -- (a line added or removed elsewhere) is rejected instead of half-applied.
  select count(*) into v_existing from public.crm_invoice_line_items where invoice_id = p_invoice_id;
  select count(distinct li.id) into v_matched
    from public.crm_invoice_line_items li
    where li.invoice_id = p_invoice_id and li.id = any(coalesce(p_line_ids, '{}'::uuid[]));
  if coalesce(cardinality(p_line_ids), 0) <> v_existing or v_matched <> v_existing then
    raise exception 'The invoice lines changed while you were reordering. Refresh and try again.' using errcode = 'P0001';
  end if;

  update public.crm_invoice_line_items li
     set sort_order = o.ord - 1
    from unnest(p_line_ids) with ordinality as o(id, ord)
   where li.id = o.id and li.invoice_id = p_invoice_id;
end;
$function$;

revoke all on function public.crm_reorder_invoice_lines(uuid, uuid[]) from public, anon;
grant execute on function public.crm_reorder_invoice_lines(uuid, uuid[]) to authenticated, service_role;
