-- WO part stock reversals credit only what was actually deducted.
--
-- adjust_part_quantity(p_part_id, p_delta, p_work_order_id) clamps at 0
-- (greatest(0, old + delta)) and returns the applied_delta, but every caller
-- ignored it: adding 5 of a part with 2 on hand deducted 2, yet deleting the
-- line (or lowering its quantity, or deleting the WO) credited the full 5
-- back — inventing 3 units and a cost layer for them.
--
-- wo_parts.quantity_deducted records how much of the line's quantity has
-- really been taken out of parts.quantity_on_hand. NULL = a row written
-- before this column existed (or by an old client): treated as "fully
-- deducted" while live and "nothing deducted" once soft-deleted, which is
-- exactly what the old code did.
--
-- set_wo_part_stock(p_wo_part_id, p_target) moves stock so the line's
-- deducted amount becomes p_target (its quantity, or 0 when the line/WO is
-- removed), under a row lock on the wo_parts row, and returns what happened.
-- Deductions go through adjust_part_quantity, so cost_layers are consumed
-- FIFO and returns append a layer at the part's unit cost, as before.

alter table public.wo_parts
  add column if not exists quantity_deducted integer;

comment on column public.wo_parts.quantity_deducted is
  'Units of this line actually removed from parts.quantity_on_hand (deductions clamp at 0). NULL = legacy row: quantity if live, 0 if deleted. Maintained by set_wo_part_stock().';

create or replace function public.set_wo_part_stock(p_wo_part_id uuid, p_target integer)
returns table(old_qty integer, new_qty integer, requested_delta integer, applied_delta integer, quantity_deducted integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_row        public.wo_parts%rowtype;
  v_deducted   integer;
  v_target     integer := greatest(0, coalesce(p_target, 0));
  v_req        integer;
  v_res        record;
  v_applied    integer := 0;
  v_old        integer;
  v_new        integer;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_row from public.wo_parts where id = p_wo_part_id for update;
  if not found then
    raise exception 'Work order part not found';
  end if;
  if v_row.org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  v_deducted := coalesce(
    v_row.quantity_deducted,
    case when v_row.deleted_at is null then v_row.quantity else 0 end
  );

  -- Not linked to an inventory part: nothing to move.
  if v_row.part_id is null then
    old_qty := null; new_qty := null;
    requested_delta := 0; applied_delta := 0;
    quantity_deducted := 0;
    return next;
    return;
  end if;

  -- Stock delta: negative = take more out, positive = give back.
  v_req := v_deducted - v_target;

  if v_req <> 0 then
    select * into v_res
      from public.adjust_part_quantity(v_row.part_id, v_req, v_row.work_order_id);
    if found and v_res.applied_delta is not null then
      v_applied := v_res.applied_delta;
      v_old := v_res.old_qty;
      v_new := v_res.new_qty;
    end if;
    -- A return (v_req > 0) is never clamped; a deduction may be short.
    v_deducted := v_deducted - v_applied;
  end if;

  -- Bookkeeping column only — keep it out of the WO's audit trail (the
  -- quantity change itself is logged by adjust_part_quantity).
  perform set_config('app.suppress_audit', 'true', true);
  update public.wo_parts set quantity_deducted = v_deducted where id = p_wo_part_id;
  perform set_config('app.suppress_audit', '', true);

  old_qty := v_old;
  new_qty := v_new;
  requested_delta := v_req;
  applied_delta := v_applied;
  quantity_deducted := v_deducted;
  return next;
end;
$function$;

revoke execute on function public.set_wo_part_stock(uuid, integer) from public, anon;
grant execute on function public.set_wo_part_stock(uuid, integer) to authenticated;
