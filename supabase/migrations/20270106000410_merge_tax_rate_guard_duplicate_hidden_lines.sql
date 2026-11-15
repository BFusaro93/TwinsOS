-- Bug sweep round 14 (4xx) F3 + F4.
--
-- F3: crm_merge_invoices re-taxed every child at the PARENT's rate, so merging
--     invoices billed at different rates silently dropped (parent 0%) or
--     changed tax already billed. Now refused with the two rates named. The
--     merge route refuses it first with the same message.
-- F4: crm_duplicate_void_invoice ("Duplicate as draft" on a void invoice)
--     dropped hide_on_print, so lines folded or hidden on the original came
--     back visible on the customer's PDF / email / portal copy. It also
--     dropped auto_bill_period_start, so later visits in that period started a
--     second draft; it is now copied unless another open draft already holds
--     the period. It also sets app.invoice_reissue for the estimate-invoice
--     guard in 20270106000420.
--
-- Both are CREATE OR REPLACE of the LIVE TEST definitions with only these
-- additions. PROD: apply BEFORE or AFTER the code deploy (no signature change).

CREATE OR REPLACE FUNCTION public.crm_merge_invoices(p_parent_id uuid, p_child_ids uuid[], p_subtotal_cents integer, p_discount_cents integer, p_tax_cents integer, p_total_cents integer)
 RETURNS TABLE(parent_status text, total_cents integer, amount_paid_cents integer, balance_cents integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_org       uuid := public.my_org_id();
  v_children  uuid[];
  v_all       uuid[];
  v_count     integer;
  v_clients   integer;
  v_client_id uuid;
  v_paid      integer;
  v_parent    record;
  v_balance   integer;
  v_status    text;
  v_mismatch  boolean;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to merge invoices' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'Unauthorized';
  end if;

  select coalesce(array_agg(distinct c), '{}') into v_children
    from unnest(coalesce(p_child_ids, '{}')) c
    where c is not null;
  if cardinality(v_children) = 0 then
    raise exception 'Select at least one invoice to merge';
  end if;
  if p_parent_id = any(v_children) then
    raise exception 'An invoice cannot be merged into itself';
  end if;
  v_all := v_children || p_parent_id;

  perform 1 from public.crm_invoices i where i.id = any(v_all) order by i.id for update;

  select count(*), count(distinct i.client_id), min(i.client_id::text)::uuid,
         coalesce(sum(i.amount_paid_cents), 0)::integer
    into v_count, v_clients, v_client_id, v_paid
    from public.crm_invoices i
    where i.id = any(v_all)
      and i.org_id = v_org
      and i.deleted_at is null;

  if v_count <> cardinality(v_all) then
    raise exception 'One or more invoices not found';
  end if;
  if v_clients > 1 then
    raise exception 'All invoices must belong to the same client';
  end if;
  -- One merged invoice bills one project / contract / estimate. Merging across them moved one
  -- project's billing onto another's invoice (the project Billing tab and the WIP report then
  -- disagreed about what each project had billed), and a contract's or estimate's billed
  -- checks lost track of the child.
  if exists (select 1 from public.crm_invoices a, public.crm_invoices b
              where a.id = p_parent_id and b.id = any(v_children)
                and a.project_id is distinct from b.project_id) then
    raise exception 'These invoices belong to different projects (or only some belong to a project). Only invoices for the same project can be merged.';
  end if;
  if exists (select 1 from public.crm_invoices a, public.crm_invoices b
              where a.id = p_parent_id and b.id = any(v_children)
                and a.contract_id is distinct from b.contract_id) then
    raise exception 'These invoices belong to different contracts (or only some belong to a contract). Only invoices for the same contract can be merged.';
  end if;
  if exists (select 1 from public.crm_invoices a, public.crm_invoices b
              where a.id = p_parent_id and b.id = any(v_children)
                and a.estimate_id is distinct from b.estimate_id) then
    raise exception 'These invoices come from different estimates (or only some come from an estimate). Only invoices from the same estimate can be merged.';
  end if;
  -- Tax is recomputed at the PARENT's rate only, so merging invoices billed at
  -- different rates silently dropped or changed tax already billed on a child.
  if (select count(distinct coalesce(i.tax_rate_bps, 0)) from public.crm_invoices i where i.id = any(v_all)) > 1 then
    raise exception 'These invoices use different tax rates (%). Change them to the same rate first, then merge.',
      (select string_agg(distinct trim_scale(coalesce(i.tax_rate_bps, 0) / 100.0)::text || '%', ' vs ')
         from public.crm_invoices i where i.id = any(v_all));
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_all) and i.status = 'void') then
    raise exception 'Cannot merge voided invoices';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_all) and i.locked) then
    raise exception 'Cannot merge locked invoices. Unlock them first.';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_children) and i.pending_payment_intent_id is not null) then
    raise exception 'Cannot merge an invoice with a payment still processing (bank debit in flight). Wait for it to settle, then merge.';
  end if;

  if exists (select 1 from public.crm_invoices i where i.id = any(v_children) and i.qbo_invoice_id is not null) then
    raise exception 'Cannot merge an invoice already synced to QuickBooks. Void or handle it in QuickBooks first.';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_children) and i.open_dispute_payment_id is not null) then
    raise exception 'Cannot merge an invoice with an open payment dispute';
  end if;

  select i.id, i.status into v_parent from public.crm_invoices i where i.id = p_parent_id;

  -- The children's lines join the parent, so they earn commission under the parent's
  -- rep and sale type. If a child is credited differently and the org pays commission,
  -- merging would move earnings between reps (or renewal ↔ new): refuse it.
  with resolved as (
    select i.id, coalesce(i.sales_rep_id, r.rep_id) as rep, coalesce(i.sale_type, r.sale_type) as sale
      from public.crm_invoices i
      cross join lateral public.crm_invoice_resolve_rep(i.client_id, i.crm_job_id, i.contract_id, i.estimate_id) r
     where i.id = any(v_all)
  )
  select exists (
    select 1 from resolved ch, resolved pa
     where pa.id = p_parent_id and ch.id <> p_parent_id
       and (ch.rep is distinct from pa.rep or ch.sale is distinct from pa.sale)
  ) into v_mismatch;
  if v_mismatch and public.crm_org_uses_commissions() then
    raise exception 'These invoices are credited to different sales reps or sale types, so merging them would move commission to the parent invoice''s rep. Merge only invoices with the same Sales Rep and Sale Type.';
  end if;

  if v_paid > 0 and v_parent.status = 'draft' then
    raise exception 'Payments are applied to these invoices — merge into an issued invoice, not a draft';
  end if;
  if v_paid > p_total_cents then
    raise exception 'The merged total (%) would be less than what has already been paid (%) — adjust the invoices first',
      to_char(p_total_cents / 100.0, 'FM$999,999,990.00'), to_char(v_paid / 100.0, 'FM$999,999,990.00');
  end if;

  -- The parent keeps its line order and each child's lines follow it, in the
  -- order the children were passed in, each in its own order. Renumbered
  -- 0..n-1 so no two lines tie.
  with ranked as (
    select li.id,
           row_number() over (
             order by case when li.invoice_id = p_parent_id then 0
                           else coalesce(array_position(p_child_ids, li.invoice_id), 2147483647) end,
                      li.sort_order, li.created_at, li.id) - 1 as rn
      from public.crm_invoice_line_items li
     where li.org_id = v_org
       and (li.invoice_id = p_parent_id or li.invoice_id = any(v_children))
  )
  update public.crm_invoice_line_items li set sort_order = ranked.rn
    from ranked where li.id = ranked.id;

  update public.crm_invoice_line_items
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  -- Parent totals BEFORE moving allocations: the allocation guard checks the
  -- moved rows against the parent's (new) total. The combined discount is a
  -- flat amount, so drop the parent's percent/applied-discount bookkeeping.
  update public.crm_invoices
    set subtotal_cents      = p_subtotal_cents,
        discount_cents      = p_discount_cents,
        discount_type       = null,
        discount_value      = null,
        applied_discount_id = null,
        tax_cents           = p_tax_cents,
        total_cents         = p_total_cents
    where id = p_parent_id;

  update public.crm_payment_allocations
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  update public.crm_payments
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  update public.crm_invoices
    set amount_paid_cents = 0,
        balance_cents     = 0
    where id = any(v_children);

  -- A milestone billed on a merged invoice is still billed, on the parent: keep it
  -- linked instead of letting the void trigger release it for re-billing.
  update public.estimate_milestones
    set invoice_id = p_parent_id
    where invoice_id = any(v_children);

  -- consolidated_into_id marks a source whose charge now lives on another invoice; the
  -- contract-invoice idempotency checks (cron + Create Invoices) count such a source as
  -- billed. A merged child is the same case, so stamp it too — without this a merged
  -- contract invoice let the month be billed a second time.
  update public.crm_invoices
    set status               = 'void',
        deleted_at           = now(),
        consolidated_into_id = p_parent_id
    where id = any(v_children);

  v_balance := greatest(0, p_total_cents - v_paid);
  v_status := case
    when v_paid > 0 and v_balance = 0 then 'paid'
    when v_paid > 0 then 'partial'
    when v_parent.status in ('paid', 'partial') then 'sent'
    else v_parent.status
  end;

  update public.crm_invoices
    set amount_paid_cents = v_paid,
        balance_cents     = v_balance,
        status            = v_status
    where id = p_parent_id;

  perform public.sync_client_balance(v_client_id);

  return query select v_status, p_total_cents, v_paid, v_balance;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_duplicate_void_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src        record;
  v_line       record;
  v_new_id     uuid;
  v_new_line   uuid;
  v_visit      uuid;
  v_jp         record;
  v_today      date;
  v_days       integer;
  v_visits     integer := 0;
  v_materials  integer := 0;
  v_milestones integer := 0;
  v_lines      integer := 0;
  v_period     date;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to create invoices' using errcode = '42501';
  end if;
  if coalesce(public.my_role(), '') = 'crew' then
    raise exception 'You do not have permission to create invoices' using errcode = '42501';
  end if;

  select * into v_src
    from public.crm_invoices
    where id = p_invoice_id
    for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if public._org_mismatch(v_src.org_id) then
    raise exception 'Unauthorized';
  end if;
  if v_src.status is distinct from 'void' then
    raise exception 'Only a void invoice can be duplicated as a draft';
  end if;
  if v_src.deleted_at is not null or v_src.consolidated_into_id is not null then
    raise exception 'This invoice was merged into another invoice or deleted, so its work is already billed there';
  end if;

  -- The re-issue of a voided invoice: the estimate approval gate on new
  -- estimate invoices does not apply (the double-billing guard still does).
  perform set_config('app.invoice_reissue', 'on', true);

  -- Keep collecting the period's later visits on the re-issued draft, unless
  -- another open draft already holds that period (one open draft per period:
  -- crm_invoices_auto_period_draft_unique).
  v_period := v_src.auto_bill_period_start;
  if v_period is not null and exists (
       select 1 from public.crm_invoices d
        where d.org_id = v_src.org_id and d.client_id = v_src.client_id
          and d.auto_bill_period_start = v_period
          and coalesce(d.tax_rate_bps, 0) = coalesce(v_src.tax_rate_bps, 0)
          and coalesce(d.sales_rep_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_src.sales_rep_id, '00000000-0000-0000-0000-000000000000'::uuid)
          and coalesce(d.po_number, '') = coalesce(v_src.po_number, '')
          and coalesce(d.terms, '') = coalesce(v_src.terms, '')
          and d.status = 'draft' and d.deleted_at is null and d.locked = false) then
    v_period := null;
  end if;

  v_today := public.org_today(v_src.org_id);
  v_days := case v_src.terms
    when 'net_10' then 10 when 'net_15' then 15 when 'net_30' then 30
    when 'net_45' then 45 when 'net_60' then 60 when 'net_90' then 90
    else 0 end;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, crm_job_id, contract_id, project_id,
    description, status, invoice_date, due_date, terms, po_number,
    subtotal_cents, discount_cents, discount_type, discount_value, applied_discount_id,
    tax_rate_bps, tax_cents, total_cents, amount_paid_cents, balance_cents,
    notes, service_address, preferred_payment_method, sales_rep_id, sale_type,
    pdf_template_id, proration_period_start, proration_period_end, catch_up_period_start, catch_up_period_end, locked,
    auto_bill_period_start
  ) values (
    v_src.org_id, auth.uid(), v_src.client_id, v_src.estimate_id, v_src.crm_job_id, v_src.contract_id, v_src.project_id,
    v_src.description, 'draft', v_today, v_today + v_days, v_src.terms, v_src.po_number,
    coalesce(v_src.subtotal_cents, 0), coalesce(v_src.discount_cents, 0), v_src.discount_type, v_src.discount_value, v_src.applied_discount_id,
    coalesce(v_src.tax_rate_bps, 0), coalesce(v_src.tax_cents, 0), coalesce(v_src.total_cents, 0), 0, coalesce(v_src.total_cents, 0),
    v_src.notes, v_src.service_address, v_src.preferred_payment_method, v_src.sales_rep_id, v_src.sale_type,
    v_src.pdf_template_id, v_src.proration_period_start, v_src.proration_period_end, v_src.catch_up_period_start, v_src.catch_up_period_end, false,
    v_period
  )
  returning id into v_new_id;

  for v_line in
    select * from public.crm_invoice_line_items
      where invoice_id = p_invoice_id
      order by sort_order nulls last, created_at, id
  loop
    -- The visit's billed tag, only while nothing else has billed it since.
    v_visit := coalesce(v_line.visit_id, v_line.released_visit_id);
    if v_visit is not null and (
         exists (select 1 from public.crm_invoice_line_items l where l.visit_id = v_visit)
         or not exists (select 1 from public.crm_job_visits v where v.id = v_visit and v.deleted_at is null)
       ) then
      v_visit := null;
    end if;

    insert into public.crm_invoice_line_items (
      org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order,
      is_taxable, service_date, hours, men, discount_cents, discount_type, discount_value,
      applied_discount_id, visit_id, product_id, service_id, is_other_charge, hide_on_print
    ) values (
      v_src.org_id, v_new_id, v_line.name, v_line.description, v_line.qty, v_line.rate_cents, v_line.total_cents, v_line.sort_order,
      v_line.is_taxable, v_line.service_date, v_line.hours, v_line.men, v_line.discount_cents, v_line.discount_type, v_line.discount_value,
      v_line.applied_discount_id, v_visit, v_line.product_id, v_line.service_id, v_line.is_other_charge, coalesce(v_line.hide_on_print, false)
    )
    returning id into v_new_line;
    v_lines := v_lines + 1;
    if v_visit is not null then
      v_visits := v_visits + 1;
    end if;

    -- Materials the void sent back to pending still point at the void line;
    -- one billed again since points at that newer line instead.
    for v_jp in
      select id from public.crm_job_products
        where invoice_line_item_id = v_line.id
          and status in ('pending', 'used')
          and deleted_at is null
        order by created_at, id
        for update
    loop
      update public.crm_job_products set invoice_line_item_id = v_new_line where id = v_jp.id;
      perform public.set_job_product_status(v_jp.id, 'invoiced');
      v_materials := v_materials + 1;
    end loop;
  end loop;

  update public.estimate_milestones
     set status = 'invoiced', invoice_id = v_new_id, released_invoice_id = null
   where released_invoice_id = p_invoice_id
     and status = 'pending'
     and invoice_id is null
     and deleted_at is null;
  get diagnostics v_milestones = row_count;

  perform set_config('app.invoice_reissue', '', true);

  return jsonb_build_object(
    'invoice_id', v_new_id,
    'lines', v_lines,
    'visits_relinked', v_visits,
    'materials_relinked', v_materials,
    'milestones_relinked', v_milestones
  );
end;
$function$;
