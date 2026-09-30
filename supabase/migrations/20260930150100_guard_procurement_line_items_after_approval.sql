-- Line items of approved / ordered POs and requisitions had no DB guard.
--
-- guard_procurement_approval_status (20260926180000) only sees the header, and
-- the header grand_total is written by the client — so a line could be
-- inserted, deleted or re-priced after approval with no header change and the
-- approved-total check never fired.
--
-- guard_procurement_line_items (BEFORE INSERT/UPDATE/DELETE on po_line_items
-- and requisition_line_items). For a change to quantity, unit_cost,
-- product_item_id or taxable, or any insert/delete, by an actor who is not
-- privileged (_approval_actor_is_privileged(): admin, service role, or the
-- app.approval_rpc GUC set by the approval RPCs):
--   * parent PO ordered / partially_fulfilled / completed / canceled, or
--     requisition ordered / closed  -> rejected. Editing a committed record
--     is admin-only (matches the PODetailPanel / RequisitionDetailPanel
--     lock and submit_for_approval's admin-only resubmit, 20260929100000).
--   * parent approved -> allowed, but the parent drops back to pending so it
--     can't be ordered on an approval that covered different lines. The app
--     already re-submits after every line mutation
--     (resubmitPOForApprovalIfNeeded / resubmitReqForApprovalIfNeeded treat
--     pending the same as approved), and submit_for_approval keeps approved
--     steps whose total didn't grow, so the normal flow ends where it did.
--   * requested / draft / pending / rejected -> unchanged behaviour.
-- project_id / notes / total_cost / names stay editable (cost allocation and
-- display fields; total_cost is derived from quantity × unit_cost). No
-- receiving columns live on the lines (receipts are goods_receipt_lines), so
-- receiving is unaffected.

create or replace function public.guard_procurement_line_items()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row        record;
  v_parent_id  uuid;
  v_status     text;
  v_entity     text;
  v_locked     boolean;
begin
  if TG_OP = 'UPDATE'
     and NEW.quantity        is not distinct from OLD.quantity
     and NEW.unit_cost       is not distinct from OLD.unit_cost
     and NEW.product_item_id is not distinct from OLD.product_item_id
     -- requisition_line_items has no taxable column; jsonb keeps one body.
     and (to_jsonb(NEW) -> 'taxable') is not distinct from (to_jsonb(OLD) -> 'taxable')
  then
    return NEW;
  end if;

  if public._approval_actor_is_privileged() then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'DELETE' then v_row := OLD; else v_row := NEW; end if;

  if TG_TABLE_NAME = 'po_line_items' then
    v_entity := 'purchase_order';
    v_parent_id := v_row.po_id;
    select status into v_status from public.purchase_orders where id = v_parent_id;
    v_locked := v_status in ('ordered', 'partially_fulfilled', 'completed', 'canceled');
  else
    v_entity := 'requisition';
    v_parent_id := v_row.requisition_id;
    select status into v_status from public.requisitions where id = v_parent_id;
    v_locked := v_status in ('ordered', 'closed');
  end if;

  -- An UPDATE that moves the line to another parent must satisfy both.
  if TG_OP = 'UPDATE' and not v_locked then
    if TG_TABLE_NAME = 'po_line_items' and OLD.po_id is distinct from NEW.po_id then
      select status in ('ordered', 'partially_fulfilled', 'completed', 'canceled') into v_locked
        from public.purchase_orders where id = OLD.po_id;
    elsif TG_TABLE_NAME = 'requisition_line_items' and OLD.requisition_id is distinct from NEW.requisition_id then
      select status in ('ordered', 'closed') into v_locked
        from public.requisitions where id = OLD.requisition_id;
    end if;
    v_locked := coalesce(v_locked, false);
  end if;

  if v_locked then
    raise exception 'This % is already % — only an admin can change its line items',
      replace(v_entity, '_', ' '), replace(v_status, '_', ' ')
      using errcode = '42501';
  end if;

  if v_status = 'approved' then
    -- The approval covered the old lines; send it back through the chain.
    perform public._approval_set_entity_status(v_entity, v_parent_id, 'pending');
  end if;

  return coalesce(NEW, OLD);
end;
$function$;

revoke all on function public.guard_procurement_line_items() from public, anon, authenticated;

drop trigger if exists trg_guard_po_line_items on public.po_line_items;
create trigger trg_guard_po_line_items
  before insert or update or delete on public.po_line_items
  for each row execute function public.guard_procurement_line_items();

drop trigger if exists trg_guard_requisition_line_items on public.requisition_line_items;
create trigger trg_guard_requisition_line_items
  before insert or update or delete on public.requisition_line_items
  for each row execute function public.guard_procurement_line_items();
