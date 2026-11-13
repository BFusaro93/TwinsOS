-- Round 13 / purchasing F6 (owner decision D5): a requisition turned into POs
-- is moved to 'ordered'. When its PO is deleted or canceled (cancel is only
-- possible before anything is received — 20270103000220), the requisition
-- stayed 'ordered' with nothing on order and could not be converted again.
--
-- Now, when the last live PO made from a requisition is deleted or canceled,
-- the requisition goes back to 'approved' (keeping its approved total), so a
-- new PO can be made from it. If that PO is restored (un-canceled), an
-- 'approved' requisition moves back to 'ordered'. A 'closed' requisition is
-- never touched. "Live" = not deleted and not canceled.
--
-- Runs as a trigger, so it covers the app, the public API and support edits.
-- PROD: apply before or after the code deploy.

CREATE OR REPLACE FUNCTION public.procurement_po_sync_requisition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_was_live   boolean := OLD.deleted_at is null and OLD.status <> 'canceled';
  v_is_live    boolean := NEW.deleted_at is null and NEW.status <> 'canceled';
  v_req_status text;
  v_prev       text;
begin
  if v_was_live = v_is_live or NEW.requisition_id is null then
    return null;
  end if;

  select status into v_req_status
    from public.requisitions
   where id = NEW.requisition_id and org_id = NEW.org_id and deleted_at is null
     for update;
  if not found then
    return null;
  end if;

  v_prev := current_setting('app.approval_rpc', true);
  if not v_is_live then
    if v_req_status = 'ordered'
       and not exists (select 1 from public.purchase_orders p
                        where p.requisition_id = NEW.requisition_id and p.id <> NEW.id
                          and p.deleted_at is null and p.status <> 'canceled') then
      perform set_config('app.approval_rpc', 'on', true);
      update public.requisitions
         -- No live PO remains, so whatever converted_po_id points at is gone.
         set status = 'approved', converted_po_id = null
       where id = NEW.requisition_id;
      perform set_config('app.approval_rpc', coalesce(v_prev, ''), true);
    end if;
  elsif v_req_status = 'approved' then
    perform set_config('app.approval_rpc', 'on', true);
    update public.requisitions
       set status = 'ordered', converted_po_id = coalesce(converted_po_id, NEW.id)
     where id = NEW.requisition_id;
    perform set_config('app.approval_rpc', coalesce(v_prev, ''), true);
  end if;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.procurement_po_sync_requisition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_orders_sync_requisition ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_sync_requisition
  AFTER UPDATE OF deleted_at, status ON public.purchase_orders
  FOR EACH ROW
  WHEN (NEW.requisition_id IS NOT NULL)
  EXECUTE FUNCTION public.procurement_po_sync_requisition();
