-- Bug 11: the parent Work Order completion gate ("Mark Complete" disabled
-- until all sub-work-orders are done/skipped) was only enforced in the UI
-- (WorkOrderDetailPanel.tsx) and re-checked client-side in
-- useUpdateWorkOrderStatus() (use-work-orders.ts) via a check-then-update
-- against the Supabase client — neither is a real guarantee, since both are
-- bypassable by any direct write to work_orders (another client, the
-- /api/v1/work-orders REST endpoint, a future code path, or RLS-permitted
-- ad-hoc access). Add a DB-level trigger so the rule holds regardless of the
-- calling path, per this codebase's stated pattern of enforcing rules at
-- both the RLS/DB layer and the API/UI layer.
--
-- The trigger only blocks the transition *into* 'done' on a parent WO (a row
-- referenced by other rows' parent_work_order_id) while any non-deleted
-- child is not yet 'done' or 'skipped'. All other status transitions,
-- non-parent work orders, and updates that don't touch status are left
-- untouched.

create or replace function public.enforce_parent_wo_completion_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_children integer;
begin
  if new.status = 'done' and (old.status is distinct from new.status) then
    select count(*) into v_open_children
    from public.work_orders sub
    where sub.parent_work_order_id = new.id
      and sub.deleted_at is null
      and sub.status not in ('done', 'skipped');

    if v_open_children > 0 then
      raise exception 'All sub-work orders must be completed or skipped before closing this work order.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_parent_wo_completion_gate on public.work_orders;

create trigger trg_enforce_parent_wo_completion_gate
  before update on public.work_orders
  for each row
  execute function public.enforce_parent_wo_completion_gate();
