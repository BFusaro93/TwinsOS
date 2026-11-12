-- Auto-invoicing: append a completed visit's lines to an open period draft in
-- ONE transaction, only while it is still an unlocked draft.
--
-- complete-visit-side-effects looked the period's open draft up, then (several
-- round trips later) inserted the visit's lines and bumped the totals with
-- increment_invoice_totals. If the office printed / sent / locked that draft in
-- between, the lines landed on an invoice the customer already had (or the
-- insert hit the lock and the visit wasn't invoiced at all). This RPC
-- row-locks the invoice, re-checks status = 'draft', not locked, not deleted,
-- and only then inserts the lines and re-totals. It returns NULL when the
-- draft is no longer open — the caller then starts a new draft — or the new
-- line ids in the order given.
--
-- SECURITY INVOKER: RLS and every crm_invoice_line_items / crm_invoices
-- trigger (write permission, lock guard, visit-tag uniqueness) apply to the
-- caller exactly as the separate writes did; increment_invoice_totals keeps
-- its own acct_add_modify_invoices check.

create or replace function public.crm_append_auto_draft_lines(
  p_invoice_id uuid,
  p_lines jsonb,
  p_delta_cents integer
)
returns uuid[]
language plpgsql
set search_path to 'public'
as $$
declare
  v_offset integer;
  v_ids    uuid[];
begin
  perform 1
    from public.crm_invoices
    where id = p_invoice_id
      and status = 'draft'
      and not coalesce(locked, false)
      and deleted_at is null
    for update;
  if not found then
    return null;
  end if;

  select count(*) into v_offset from public.crm_invoice_line_items where invoice_id = p_invoice_id;

  with ins as (
    insert into public.crm_invoice_line_items (
      org_id, invoice_id, name, description, qty, rate_cents, total_cents,
      service_date, is_taxable, product_id, sort_order, visit_id
    )
    select (e.value->>'org_id')::uuid,
           p_invoice_id,
           e.value->>'name',
           e.value->>'description',
           (e.value->>'qty')::numeric,
           (e.value->>'rate_cents')::integer,
           (e.value->>'total_cents')::integer,
           nullif(e.value->>'service_date', '')::date,
           coalesce((e.value->>'is_taxable')::boolean, false),
           nullif(e.value->>'product_id', '')::uuid,
           v_offset + (e.ordinality::integer - 1),
           nullif(e.value->>'visit_id', '')::uuid
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as e(value, ordinality)
      order by e.ordinality
    returning id, sort_order
  )
  select array_agg(id order by sort_order) into v_ids from ins;

  perform public.increment_invoice_totals(p_invoice_id, p_delta_cents);

  return coalesce(v_ids, '{}'::uuid[]);
end;
$$;
revoke all on function public.crm_append_auto_draft_lines(uuid, jsonb, integer) from public, anon;
grant execute on function public.crm_append_auto_draft_lines(uuid, jsonb, integer) to authenticated, service_role;
