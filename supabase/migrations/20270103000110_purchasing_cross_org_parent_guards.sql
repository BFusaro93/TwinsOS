-- Cross-org purchasing parents (round 13, security).
--
-- po_line_items.po_id, requisition_line_items.requisition_id,
-- goods_receipts.purchase_order_id and goods_receipt_lines.po_line_item_id
-- were plain FKs: a user could insert a row in their own org pointing at
-- ANOTHER org's PO/requisition/receipt (needs only the UUID), and the
-- SECURITY DEFINER refresh triggers then rewrote that org's PO totals and
-- receipt status. Same for the catalog references (product_item_id,
-- project_id, part_id).
--
-- One BEFORE INSERT/UPDATE trigger per table (template:
-- wo_vendor_charges_check_cross_org) rejects any referenced parent whose
-- org_id differs from NEW.org_id. Applies to every writer, service role and
-- RPCs included — a cross-org parent is never valid.
-- Triggers are named a_* so they run before the other BEFORE triggers
-- (guard_procurement_line_items etc.) look at the parent.
--
-- PROD: apply BEFORE the code deploy (no code change depends on it; the round-13
-- PROD pre-check for existing cross-org rows must return 0 rows).

create or replace function public._procurement_assert_same_org(
  p_label text, p_id uuid, p_parent_org uuid, p_found boolean, p_org uuid
) returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  if p_id is null or not p_found then
    return;  -- nothing linked, or the FK reports the missing row
  end if;
  if p_parent_org is distinct from p_org then
    raise exception '% % does not belong to this organization', p_label, p_id
      using errcode = '23503';
  end if;
end;
$$;

revoke all on function public._procurement_assert_same_org(text, uuid, uuid, boolean, uuid) from public, anon, authenticated;

create or replace function public.procurement_check_parent_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_found boolean;
begin
  if new.org_id is null then
    return new;
  end if;

  if tg_table_name in ('po_line_items', 'requisition_line_items') then
    if tg_table_name = 'po_line_items' then
      select po.org_id, true into v_org, v_found from public.purchase_orders po where po.id = new.po_id;
      perform public._procurement_assert_same_org('Purchase order', new.po_id, v_org, coalesce(v_found, false), new.org_id);
    else
      select r.org_id, true into v_org, v_found from public.requisitions r where r.id = new.requisition_id;
      perform public._procurement_assert_same_org('Requisition', new.requisition_id, v_org, coalesce(v_found, false), new.org_id);
    end if;

    if new.product_item_id is not null then
      v_found := false;
      select p.org_id, true into v_org, v_found from public.product_items p where p.id = new.product_item_id;
      perform public._procurement_assert_same_org('Product', new.product_item_id, v_org, coalesce(v_found, false), new.org_id);
    end if;
    if new.project_id is not null then
      v_found := false;
      select p.org_id, true into v_org, v_found from public.projects p where p.id = new.project_id;
      perform public._procurement_assert_same_org('Project', new.project_id, v_org, coalesce(v_found, false), new.org_id);
    end if;
    if new.part_id is not null then
      v_found := false;
      select p.org_id, true into v_org, v_found from public.parts p where p.id = new.part_id;
      perform public._procurement_assert_same_org('Part', new.part_id, v_org, coalesce(v_found, false), new.org_id);
    end if;

  elsif tg_table_name = 'goods_receipts' then
    select po.org_id, true into v_org, v_found from public.purchase_orders po where po.id = new.purchase_order_id;
    perform public._procurement_assert_same_org('Purchase order', new.purchase_order_id, v_org, coalesce(v_found, false), new.org_id);

  elsif tg_table_name = 'goods_receipt_lines' then
    select gr.org_id, true into v_org, v_found from public.goods_receipts gr where gr.id = new.receipt_id;
    perform public._procurement_assert_same_org('Goods receipt', new.receipt_id, v_org, coalesce(v_found, false), new.org_id);
    if new.po_line_item_id is not null then
      v_found := false;
      select li.org_id, true into v_org, v_found from public.po_line_items li where li.id = new.po_line_item_id;
      perform public._procurement_assert_same_org('PO line', new.po_line_item_id, v_org, coalesce(v_found, false), new.org_id);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.procurement_check_parent_org() from public, anon, authenticated;

drop trigger if exists a_po_line_items_check_parent_org on public.po_line_items;
create trigger a_po_line_items_check_parent_org
  before insert or update of po_id, product_item_id, project_id, part_id, org_id on public.po_line_items
  for each row execute function public.procurement_check_parent_org();

drop trigger if exists a_requisition_line_items_check_parent_org on public.requisition_line_items;
create trigger a_requisition_line_items_check_parent_org
  before insert or update of requisition_id, product_item_id, project_id, part_id, org_id on public.requisition_line_items
  for each row execute function public.procurement_check_parent_org();

drop trigger if exists a_goods_receipts_check_parent_org on public.goods_receipts;
create trigger a_goods_receipts_check_parent_org
  before insert or update of purchase_order_id, org_id on public.goods_receipts
  for each row execute function public.procurement_check_parent_org();

drop trigger if exists a_goods_receipt_lines_check_parent_org on public.goods_receipt_lines;
create trigger a_goods_receipt_lines_check_parent_org
  before insert or update of receipt_id, po_line_item_id, org_id on public.goods_receipt_lines
  for each row execute function public.procurement_check_parent_org();
