-- Bug sweep round 14 (4xx): document discount split pro-rata between taxable
-- and non-taxable lines (owner decision).
--
-- Every invoice total path (computeInvoiceTotals, increment_invoice_totals,
-- crm_release_job_product_from_invoice, the merge) took the WHOLE document
-- discount off the TAXABLE base first. On a mixed invoice ($1,000 non-taxable
-- labor + $200 taxable materials, $200 discount) tax became $0. Now the
-- discount reduces the taxable base by the taxable lines' share of the
-- subtotal: $200 x 200/1200 = $33.33 off the $200, tax on $166.67.
--
-- Issued invoices are NOT recomputed. crm_invoices.discount_tax_basis records
-- which rule an invoice's totals use, and no existing row is updated:
--   * existing rows keep NULL, read as 'taxable_first' unless the invoice is
--     still a draft (resolve: _invoice_discount_tax_basis / TS
--     resolveDiscountTaxBasis). An issued invoice therefore keeps the old rule
--     on every later recompute (edit, line delete, merge into it);
--   * an existing draft and every new invoice (column default) use 'pro_rata';
--     a draft's stored totals only change when it is next recomputed;
--   * the first update of a NULL row stamps the resolved value
--     (zz_crm_invoices_stamp_discount_tax_basis), so a draft issued later
--     keeps 'pro_rata'. It runs after the write-permission / void / lock
--     guards, so they never see it as a user change, and skips void rows.
-- crm_duplicate_void_invoice copies the source's basis (a re-issue reproduces
-- the voided invoice's figures).
--
-- Estimates: estimate lines carry no taxability (the whole discounted
-- subtotal is taxed), so the pro-rata split equals today's rule there and no
-- estimate total changes.
--
-- PROD: apply BEFORE the code deploys (new code selects discount_tax_basis).
-- Old code keeps working (it never reads the column; the DB functions apply
-- the row's own rule).

alter table public.crm_invoices
  add column if not exists discount_tax_basis text;
alter table public.crm_invoices
  alter column discount_tax_basis set default 'pro_rata';
alter table public.crm_invoices
  drop constraint if exists crm_invoices_discount_tax_basis_check;
alter table public.crm_invoices
  add constraint crm_invoices_discount_tax_basis_check
  check (discount_tax_basis in ('pro_rata', 'taxable_first'));
comment on column public.crm_invoices.discount_tax_basis is
  'How the document discount reduces the taxable base: pro_rata (taxable share of the subtotal) or taxable_first (whole discount off the taxable lines). NULL = created before 20270106000430: taxable_first unless still a draft.';

create or replace function public._invoice_discount_tax_basis(p_basis text, p_status text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(p_basis, case when p_status = 'draft' then 'pro_rata' else 'taxable_first' end);
$function$;

create or replace function public.stamp_invoice_discount_tax_basis()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.discount_tax_basis is null and old.status is distinct from 'void' then
    new.discount_tax_basis := public._invoice_discount_tax_basis(null, old.status);
  end if;
  return new;
end;
$function$;

drop trigger if exists zz_crm_invoices_stamp_discount_tax_basis on public.crm_invoices;
create trigger zz_crm_invoices_stamp_discount_tax_basis
  before update on public.crm_invoices
  for each row when (new.discount_tax_basis is null)
  execute function public.stamp_invoice_discount_tax_basis();

create or replace function public._invoice_taxable_base(
  p_taxable_net integer, p_subtotal integer, p_discount integer, p_basis text)
returns integer
language sql
immutable
set search_path to 'public'
as $function$
  select greatest(0, coalesce(p_taxable_net, 0) - case
    when coalesce(p_discount, 0) <= 0 then 0
    when p_basis = 'taxable_first' then p_discount
    when coalesce(p_subtotal, 0) <= 0 or coalesce(p_taxable_net, 0) <= 0 then 0
    when p_taxable_net >= p_subtotal then p_discount
    else round(p_discount::numeric * p_taxable_net / p_subtotal)::integer
  end);
$function$;

comment on function public._invoice_taxable_base(integer, integer, integer, text) is
  'Taxable base after the document discount: pro_rata (taxable share of the subtotal) or taxable_first. Mirrors invoiceTaxableBaseCents in src/lib/invoices/totals.ts.';

CREATE OR REPLACE FUNCTION public.increment_invoice_totals(p_invoice_id uuid, p_delta_cents integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id         uuid;
  v_subtotal       integer;
  v_discount       integer;
  v_discount_type  text;
  v_discount_value integer;
  v_tax_rate_bps   integer;
  v_amount_paid    integer;
  v_taxable_net    integer;
  v_tax_cents      integer;
  v_total_cents    integer;
  v_basis          text;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to modify invoices'
      using errcode = '42501';
  end if;

  if p_delta_cents = 0 then
    return;
  end if;

  select org_id, subtotal_cents, coalesce(discount_cents, 0), discount_type, discount_value, coalesce(tax_rate_bps, 0), coalesce(amount_paid_cents, 0), public._invoice_discount_tax_basis(discount_tax_basis, status)
    into v_org_id, v_subtotal, v_discount, v_discount_type, v_discount_value, v_tax_rate_bps, v_amount_paid, v_basis
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  v_subtotal := v_subtotal + p_delta_cents;

  -- A percent document discount (discount_value in bps) is a share of the
  -- CURRENT subtotal, not the frozen snapshot in discount_cents; re-derive it,
  -- then clamp any discount to [0, subtotal] so an appended/removed visit can't
  -- leave an oversized discount driving the total negative. Mirrors
  -- computeInvoiceTotals in src/lib/hooks/use-invoices.ts.
  if v_discount_type = 'percent' then
    v_discount := round(greatest(0, v_subtotal)::numeric * coalesce(v_discount_value, 0) / 10000)::integer;
  end if;
  v_discount := least(greatest(0, v_discount), greatest(0, v_subtotal));

  select coalesce(sum(li.total_cents - coalesce(li.discount_cents, 0)), 0)
    into v_taxable_net
    from public.crm_invoice_line_items li
    where li.invoice_id = p_invoice_id
      and li.is_taxable = true;

  -- The document discount reduces the taxable base by the taxable lines' share
  -- of the subtotal (pro_rata), or wholly (taxable_first: invoices issued
  -- before 20270106000430). Mirrors invoiceTaxableBaseCents in TS.
  v_tax_cents := round((public._invoice_taxable_base(v_taxable_net, v_subtotal, v_discount, v_basis)::numeric * v_tax_rate_bps) / 10000)::integer;
  v_total_cents := v_subtotal - v_discount + v_tax_cents;

  update public.crm_invoices
  set subtotal_cents = v_subtotal,
      discount_cents = v_discount,
      tax_cents      = v_tax_cents,
      total_cents    = v_total_cents,
      balance_cents  = greatest(0, v_total_cents - v_amount_paid),
      updated_at     = now()
  where id = p_invoice_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_release_job_product_from_invoice(p_job_product_id uuid, p_new_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_basis     text;
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
         least(greatest(0, coalesce(i.tax_rate_bps, 0)), 10000),
         public._invoice_discount_tax_basis(i.discount_tax_basis, i.status)
    into v_raw_disc, v_rate, v_basis
    from public.crm_invoices i where i.id = v_inv.id;

  v_disc  := least(greatest(0, v_raw_disc), greatest(0, v_subtotal));
  v_tax   := round(public._invoice_taxable_base(v_taxable, v_subtotal, v_disc, v_basis)::numeric * v_rate / 10000)::integer;
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
    auto_bill_period_start, discount_tax_basis
  ) values (
    v_src.org_id, auth.uid(), v_src.client_id, v_src.estimate_id, v_src.crm_job_id, v_src.contract_id, v_src.project_id,
    v_src.description, 'draft', v_today, v_today + v_days, v_src.terms, v_src.po_number,
    coalesce(v_src.subtotal_cents, 0), coalesce(v_src.discount_cents, 0), v_src.discount_type, v_src.discount_value, v_src.applied_discount_id,
    coalesce(v_src.tax_rate_bps, 0), coalesce(v_src.tax_cents, 0), coalesce(v_src.total_cents, 0), 0, coalesce(v_src.total_cents, 0),
    v_src.notes, v_src.service_address, v_src.preferred_payment_method, v_src.sales_rep_id, v_src.sale_type,
    v_src.pdf_template_id, v_src.proration_period_start, v_src.proration_period_end, v_src.catch_up_period_start, v_src.catch_up_period_end, false,
    v_period, public._invoice_discount_tax_basis(v_src.discount_tax_basis, 'void')
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
