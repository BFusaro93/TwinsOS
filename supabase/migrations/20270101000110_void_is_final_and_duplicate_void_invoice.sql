-- Void is final, and a void invoice can be duplicated as a new draft.
--
-- Owner decision: a void invoice never changes status again. The status menu
-- used to let it go back to draft / sent / paid, which re-opened an invoice
-- whose visits, materials and milestones had already been released (and maybe
-- billed again on another invoice), and whose QuickBooks copy can't be
-- reopened at all. To bill the same work again the office now uses
-- "Duplicate as draft", which copies the lines onto a new draft and re-links
-- only what is still unbilled.
--
-- 1. trg_crm_invoices_void_is_final refuses any status change away from
--    'void', for every caller. No server path needs to reopen one: merges
--    void+delete the children and never restore them, Stripe/QuickBooks never
--    un-void, and payments skip void invoices. (crm_invoice_restore_balance_on_unvoid
--    is left in place; it simply never fires now.)
--
-- 2. Voiding already releases a visit's "billed" tag (crm_invoice_line_items.visit_id
--    -> null, free_visit_tags_on_dead_invoice) and a milestone
--    (estimate_milestones -> pending, invoice_id null,
--    release_milestone_on_invoice_void). Both now also remember what they
--    released: crm_invoice_line_items.released_visit_id and
--    estimate_milestones.released_invoice_id. Materials keep their
--    invoice_line_item_id pointing at the void line when the app sends them
--    back to pending, so they need nothing new.
--
-- 3. crm_duplicate_void_invoice(invoice) creates the draft:
--      * header copied (client, job, contract, project, estimate, terms,
--        discount, tax rate, rep, PO, notes ...), dated today in the org's
--        zone, no number (assigned when it is issued), nothing paid;
--      * every line copied;
--      * a line's visit is re-tagged only while no other line carries that
--        visit (it hasn't been billed again since) and the visit still exists;
--      * a material still linked to the void line and still pending/used is
--        linked to the new line and set to invoiced (set_job_product_status,
--        which takes the stock out again);
--      * a milestone this invoice released that is still pending with no
--        invoice is marked invoiced on the new draft.
--    Anything already billed elsewhere is left alone; its line is still
--    copied as a plain line for the office to keep or delete.
--    Needs Add/Modify Invoices. Refused for a merged (consolidated) or
--    deleted invoice: its lines already live on the invoice it merged into.

-- ── 1. void is final ────────────────────────────────────────────────────────
create or replace function public.crm_invoice_void_is_final()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.status = 'void' and new.status is distinct from 'void' then
    raise exception 'A void invoice can''t be reopened. Use "Duplicate as draft" on it to bill this work again.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.crm_invoice_void_is_final() from public, anon, authenticated;

drop trigger if exists trg_crm_invoices_void_is_final on public.crm_invoices;
create trigger trg_crm_invoices_void_is_final
  before update of status on public.crm_invoices
  for each row execute function public.crm_invoice_void_is_final();

-- ── 2. remember what a void released ────────────────────────────────────────
alter table public.crm_invoice_line_items
  add column if not exists released_visit_id uuid references public.crm_job_visits(id) on delete set null;
comment on column public.crm_invoice_line_items.released_visit_id is
  'The visit this line billed before its invoice was voided/deleted and the visit tag (visit_id) was released. Used only by crm_duplicate_void_invoice to re-link the visit.';

alter table public.estimate_milestones
  add column if not exists released_invoice_id uuid references public.crm_invoices(id) on delete set null;
comment on column public.estimate_milestones.released_invoice_id is
  'The invoice that billed this milestone before it was voided/deleted and the milestone went back to pending. Used only by crm_duplicate_void_invoice.';

-- Latest: 20261229000110_void_locked_invoice_frees_visit_tags.sql (+ released_visit_id).
create or replace function public.free_visit_tags_on_dead_invoice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.status = 'void' and old.status is distinct from 'void')
     or (new.deleted_at is not null and old.deleted_at is null) then
    -- Transaction-local, and cleared again right after: the lock trigger only
    -- honours it for a visit_id -> null change (see below).
    perform set_config('app.freeing_visit_tags', 'on', true);
    update public.crm_invoice_line_items
       set released_visit_id = visit_id,
           visit_id = null
     where invoice_id = new.id
       and visit_id is not null;
    perform set_config('app.freeing_visit_tags', '', true);
  end if;
  return new;
end;
$$;

-- Latest: 20261229000110_void_locked_invoice_frees_visit_tags.sql. The
-- exemption now also lets released_visit_id record the visit being released
-- (and nothing else).
create or replace function public.crm_invoice_line_items_block_when_locked()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_old_locked boolean;
  v_new_locked boolean;
begin
  if tg_op = 'DELETE' then
    select locked into v_old_locked from public.crm_invoices where id = old.invoice_id;
    if coalesce(v_old_locked, false) then
      raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    select locked into v_new_locked from public.crm_invoices where id = new.invoice_id;
    if coalesce(v_new_locked, false) then
      raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  -- Voiding / soft-deleting a locked invoice releases its visit tags
  -- (free_visit_tags_on_dead_invoice). That one change — visit_id to NULL,
  -- remembered in released_visit_id, and nothing else — is allowed through
  -- while that trigger's flag is set.
  if coalesce(current_setting('app.freeing_visit_tags', true), '') = 'on'
     and new.visit_id is null
     and old.visit_id is not null
     and new.released_visit_id is not distinct from old.visit_id
     and (to_jsonb(new) - 'visit_id' - 'released_visit_id' - 'updated_at')
         = (to_jsonb(old) - 'visit_id' - 'released_visit_id' - 'updated_at') then
    return new;
  end if;

  select locked into v_old_locked from public.crm_invoices where id = old.invoice_id;
  select locked into v_new_locked from public.crm_invoices where id = new.invoice_id;
  if coalesce(v_old_locked, false) or coalesce(v_new_locked, false) then
    raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Latest: 20261013000000_audit_fix_trigger_function_hardening.sql (+ released_invoice_id).
create or replace function public.release_milestone_on_invoice_void()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.status = 'void' and old.status is distinct from 'void')
     or (new.deleted_at is not null and old.deleted_at is null) then
    update public.estimate_milestones
       set status = 'pending', invoice_id = null, released_invoice_id = new.id
     where invoice_id = new.id
       and status = 'invoiced';
  end if;
  return new;
end;
$$;
revoke execute on function public.release_milestone_on_invoice_void() from public, anon, authenticated;

-- ── 3. duplicate a void invoice as a draft ──────────────────────────────────
create or replace function public.crm_duplicate_void_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
    pdf_template_id, proration_period_start, proration_period_end, locked
  ) values (
    v_src.org_id, auth.uid(), v_src.client_id, v_src.estimate_id, v_src.crm_job_id, v_src.contract_id, v_src.project_id,
    v_src.description, 'draft', v_today, v_today + v_days, v_src.terms, v_src.po_number,
    coalesce(v_src.subtotal_cents, 0), coalesce(v_src.discount_cents, 0), v_src.discount_type, v_src.discount_value, v_src.applied_discount_id,
    coalesce(v_src.tax_rate_bps, 0), coalesce(v_src.tax_cents, 0), coalesce(v_src.total_cents, 0), 0, coalesce(v_src.total_cents, 0),
    v_src.notes, v_src.service_address, v_src.preferred_payment_method, v_src.sales_rep_id, v_src.sale_type,
    v_src.pdf_template_id, v_src.proration_period_start, v_src.proration_period_end, false
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
      applied_discount_id, visit_id, product_id, service_id, is_other_charge
    ) values (
      v_src.org_id, v_new_id, v_line.name, v_line.description, v_line.qty, v_line.rate_cents, v_line.total_cents, v_line.sort_order,
      v_line.is_taxable, v_line.service_date, v_line.hours, v_line.men, v_line.discount_cents, v_line.discount_type, v_line.discount_value,
      v_line.applied_discount_id, v_visit, v_line.product_id, v_line.service_id, v_line.is_other_charge
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

  return jsonb_build_object(
    'invoice_id', v_new_id,
    'lines', v_lines,
    'visits_relinked', v_visits,
    'materials_relinked', v_materials,
    'milestones_relinked', v_milestones
  );
end;
$$;
revoke all on function public.crm_duplicate_void_invoice(uuid) from public, anon;
grant execute on function public.crm_duplicate_void_invoice(uuid) to authenticated, service_role;
