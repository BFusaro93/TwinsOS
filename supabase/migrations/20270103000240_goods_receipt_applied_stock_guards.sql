-- Round 13 / purchasing F5: goods receipts whose stock was applied.
--
-- _receiving_claim_line refuses to add a PO line's units to stock twice by
-- comparing the units received on live receipts with the units already
-- applied (goods_receipt_lines.part_qty_applied / product_qty_applied).
-- Hard-deleting a receipt (or line), soft-deleting the receipt, or un-linking a
-- line from its PO line dropped those counters from the comparison, so the
-- same delivery could be received into stock again.
--
--  * A receipt line, or a receipt, whose stock was applied can no longer be
--    deleted (hard or soft) or have its PO line changed / cleared. To take it
--    back, edit the receipt's received quantity to 0 first (that removes the
--    units through correct_*_receipt and zeroes the counters).
--  * rollback_goods_receipt(receipt_id): the receiving dialog's "inventory
--    update failed, undo this receipt" path. It removes exactly the applied
--    units from the part / product (this PO's cost layers first, clamped at
--    what is on hand — same as correct_*_receipt), then deletes the receipt.
--    Allowed for the receipt's creator within an hour, or an admin.
--
-- PROD: apply IMMEDIATELY AFTER the code deploy. The old ReceiveGoodsDialog
-- reverses stock itself and then deletes the receipt; with these guards that
-- delete is refused, leaving a receipt whose stock was already taken back.
-- (The new code calls rollback_goods_receipt instead.)

CREATE OR REPLACE FUNCTION public.goods_receipt_lines_guard_applied_removal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_setting('app.receiving_rpc', true) is not distinct from 'on' then
    return coalesce(NEW, OLD);
  end if;
  if coalesce(OLD.part_qty_applied, 0) > 0 or coalesce(OLD.product_qty_applied, 0) > 0 then
    if TG_OP = 'DELETE' then
      raise exception 'This receipt line (%) has already been added to stock, so it can''t be deleted — edit the receipt''s received quantity to 0 first',
        coalesce(OLD.product_item_name, 'item') using errcode = '42501';
    elsif NEW.po_line_item_id is distinct from OLD.po_line_item_id then
      raise exception 'This receipt line (%) has already been added to stock, so it can''t be moved off its PO line — edit the receipt''s received quantity to 0 first',
        coalesce(OLD.product_item_name, 'item') using errcode = '42501';
    end if;
  end if;
  return coalesce(NEW, OLD);
end;
$function$;

DROP TRIGGER IF EXISTS trg_goods_receipt_lines_guard_applied_removal ON public.goods_receipt_lines;
CREATE TRIGGER trg_goods_receipt_lines_guard_applied_removal
  BEFORE DELETE OR UPDATE OF po_line_item_id ON public.goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.goods_receipt_lines_guard_applied_removal();

CREATE OR REPLACE FUNCTION public.goods_receipts_guard_applied_removal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if current_setting('app.receiving_rpc', true) is not distinct from 'on' then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP = 'UPDATE' and not (OLD.deleted_at is null and NEW.deleted_at is not null) then
    return NEW;
  end if;
  if exists (select 1 from public.goods_receipt_lines
              where receipt_id = OLD.id
                and (coalesce(part_qty_applied, 0) > 0 or coalesce(product_qty_applied, 0) > 0)) then
    raise exception 'Receipt % has already been added to stock, so it can''t be deleted — edit its received quantities to 0 first',
      coalesce(OLD.receipt_number, '') using errcode = '42501';
  end if;
  return coalesce(NEW, OLD);
end;
$function$;

REVOKE ALL ON FUNCTION public.goods_receipts_guard_applied_removal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_goods_receipts_guard_applied_removal ON public.goods_receipts;
CREATE TRIGGER trg_goods_receipts_guard_applied_removal
  BEFORE DELETE OR UPDATE OF deleted_at ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.goods_receipts_guard_applied_removal();

-- ── Undo a just-recorded receipt, stock included ────────────────────────────
CREATE OR REPLACE FUNCTION public.rollback_goods_receipt(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_gr       public.goods_receipts%rowtype;
  v_line     record;
  v_product  uuid;
  v_part     uuid;
  v_po_prod  uuid;
  v_reversed jsonb := '[]'::jsonb;
  v_prev     text;
begin
  select role into v_role from public.profiles where id = v_uid and status = 'active';
  if v_uid is null or v_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_role in ('viewer', 'requestor') or coalesce(public.my_org_is_read_only(), false) then
    raise exception 'Your role can''t change goods receipts' using errcode = '42501';
  end if;

  select * into v_gr from public.goods_receipts where id = p_receipt_id for update;
  if not found or public._org_mismatch(v_gr.org_id) then
    raise exception 'Receipt not found' using errcode = 'P0002';
  end if;
  -- Meant for undoing a receipt whose stock update just failed — not a general
  -- "delete receipt" (edit the quantities to 0 for that).
  if v_role is distinct from 'admin'
     and (v_gr.created_by is distinct from v_uid or v_gr.created_at < now() - interval '1 hour') then
    raise exception 'Only an admin can remove this receipt — edit its received quantities instead'
      using errcode = '42501';
  end if;

  for v_line in
    select grl.*
      from public.goods_receipt_lines grl
     where grl.receipt_id = p_receipt_id
       and (coalesce(grl.part_qty_applied, 0) > 0 or coalesce(grl.product_qty_applied, 0) > 0)
     order by grl.created_at desc, grl.id desc
     for update
  loop
    -- Resolve the product the way the receiving dialog did: the PO line's
    -- catalog product, then part number, then exact name.
    select pl.product_item_id into v_po_prod from public.po_line_items pl where pl.id = v_line.po_line_item_id;
    v_product := null;
    if v_po_prod is not null then
      select id into v_product from public.product_items
       where id = v_po_prod and org_id = v_gr.org_id and deleted_at is null;
    end if;
    if v_product is null and coalesce(v_line.part_number, '') <> '' then
      select id into v_product from public.product_items
       where org_id = v_gr.org_id and part_number = v_line.part_number and deleted_at is null
       order by created_at limit 1;
    end if;
    if v_product is null and coalesce(v_line.product_item_name, '') <> '' then
      select id into v_product from public.product_items
       where org_id = v_gr.org_id and name = v_line.product_item_name and deleted_at is null
       order by created_at limit 1;
    end if;
    if v_product is null then
      raise exception 'Can''t find the catalog product for "%" to take its received units back out of stock',
        v_line.product_item_name using errcode = 'P0002';
    end if;

    -- Newest step first: the product layer, then the part (whose stock
    -- change is mirrored onto its product by sync_part_stock_to_product).
    if coalesce(v_line.product_qty_applied, 0) > 0 then
      perform public.correct_product_receipt(v_gr.org_id, v_product, -v_line.product_qty_applied,
                                             round(coalesce(v_line.unit_cost, 0))::integer, coalesce(v_gr.po_number, ''));
    end if;
    if coalesce(v_line.part_qty_applied, 0) > 0 then
      select id into v_part from public.parts
       where org_id = v_gr.org_id and product_item_id = v_product and deleted_at is null
       order by created_at limit 1;
      if v_part is null and coalesce(v_line.part_number, '') <> '' then
        select id into v_part from public.parts
         where org_id = v_gr.org_id and part_number = v_line.part_number and deleted_at is null
         order by created_at limit 1;
      end if;
      if v_part is null then
        raise exception 'Can''t find the part for "%" to take its received units back out of stock',
          v_line.product_item_name using errcode = 'P0002';
      end if;
      perform public.correct_part_receipt(v_gr.org_id, v_part, -round(v_line.part_qty_applied)::integer,
                                          round(coalesce(v_line.unit_cost, 0))::integer, coalesce(v_gr.po_number, ''));
    end if;

    v_reversed := v_reversed || jsonb_build_object(
      'line_id', v_line.id, 'product_id', v_product, 'part_id', v_part,
      'product_qty', v_line.product_qty_applied, 'part_qty', v_line.part_qty_applied);
    v_part := null;
  end loop;

  v_prev := current_setting('app.receiving_rpc', true);
  perform set_config('app.receiving_rpc', 'on', true);
  delete from public.goods_receipts where id = p_receipt_id;
  perform set_config('app.receiving_rpc', coalesce(v_prev, ''), true);

  return jsonb_build_object('receipt_id', p_receipt_id, 'reversed', v_reversed);
end;
$function$;

REVOKE ALL ON FUNCTION public.rollback_goods_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_goods_receipt(uuid) TO authenticated, service_role;
