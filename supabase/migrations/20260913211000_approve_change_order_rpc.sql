-- Approving a change order is several writes that must all land or none:
-- flip the CO, move the project's EAC, recompute the contract price, and
-- reshape the pending billing schedule. Half of that applied would leave a
-- contract price that doesn't match its own milestones.
--
-- The schedule rule is what makes an already-collected deposit safe. Consider
-- a $40,000 contract billed 30/40/30 with the deposit already invoiced at
-- $12,000 and a $20,000 change order:
--
--   re-percenting everything against $60,000 gives 12,000 (locked)
--   + 24,000 + 18,000 = $54,000 -- the client is under-billed by $6,000,
--   the deposit's share of the increase, and nothing says so.
--
-- So an approved CO distributes ITS OWN amount across the PENDING milestones
-- only, pro-rata to what they are currently worth, in exact cents:
--   Progress 16,000 + 11,428.57 = 27,428.57
--   Final    12,000 +  8,571.43 = 20,571.43
--   with the locked 12,000 that re-totals to exactly $60,000.
--
-- Distributing the delta (rather than re-spreading the whole remaining
-- balance) also preserves a deliberately under-allocated schedule.
--
-- Affected milestones are rewritten as flat amounts. Basis points only resolve
-- to 0.01% -- $100 on a $1M contract -- which cannot express a pro-rata share
-- exactly, and a percentage that silently rounds is worse than a figure.

create or replace function public.approve_change_order(
  p_change_order_id uuid,
  p_treatment       text default null
)
returns table(change_order_id uuid, new_contract_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id     uuid;
  v_project_id uuid;
  v_status     text;
  v_amount     integer;
  v_cost       integer;
  v_treatment  text;
  v_title      text;
  v_co_number  integer;
  v_old_contract integer;
  v_new_contract integer;
  v_pending_total bigint := 0;
  v_allocated  bigint := 0;
  v_share      integer;
  v_idx        integer := 0;
  v_count      integer;
  v_target     uuid;
  v_next_sort  integer;
  r            record;
begin
  select co.org_id, co.project_id, co.status, co.amount_cents, co.cost_impact_cents,
         coalesce(p_treatment, co.billing_treatment), co.title, co.co_number
    into v_org_id, v_project_id, v_status, v_amount, v_cost, v_treatment, v_title, v_co_number
    from public.project_change_orders co
    where co.id = p_change_order_id and co.deleted_at is null
    for update;

  if not found then
    raise exception 'Change order not found';
  end if;
  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;
  if v_status = 'approved' then
    raise exception 'Change order already approved';
  end if;

  -- Lock the project too: two COs approving at once must not both read the
  -- same pending milestone amounts and each distribute against a stale base.
  select contract_price into v_old_contract
    from public.projects where id = v_project_id for update;

  -- Snapshot what each PENDING milestone is worth under the OLD contract,
  -- before the price moves. Percent milestones resolve live, matching
  -- create_invoice_from_milestone.
  create temp table if not exists _co_pending (
    id uuid, current_cents integer, sort_order integer
  ) on commit drop;
  delete from _co_pending;

  insert into _co_pending (id, current_cents, sort_order)
  select m.id,
         case
           when m.milestone_type = 'percent' and coalesce(v_old_contract, 0) > 0
             then round(v_old_contract::numeric * m.milestone_value / 10000)::int
           else m.amount_cents
         end,
         m.sort_order
  from public.estimate_milestones m
  where m.project_id = v_project_id
    and m.status = 'pending'
    and m.deleted_at is null;

  select count(*), coalesce(sum(current_cents), 0) into v_count, v_pending_total from _co_pending;

  -- Approve, then let the contract price catch up.
  update public.project_change_orders
  set status = 'approved', approved_at = now(), approved_by = auth.uid(),
      billing_treatment = v_treatment
  where id = p_change_order_id;

  -- Extra scope costs money. Without this the WIP report reads the added
  -- revenue as pure margin.
  if v_cost <> 0 then
    update public.projects
    set estimated_cost_cents = greatest(0, estimated_cost_cents + v_cost)
    where id = v_project_id;
  end if;

  perform public.fn_recalc_project_contract_price(v_project_id);
  select contract_price into v_new_contract from public.projects where id = v_project_id;

  -- Nothing pending to absorb the money: fall back to its own milestone so the
  -- amount stays billable instead of vanishing from the schedule.
  if v_treatment in ('distribute', 'final_milestone') and v_count = 0 then
    v_treatment := 'own_milestone';
  end if;

  if v_treatment = 'distribute' and v_amount <> 0 then
    for r in select * from _co_pending order by sort_order, id loop
      v_idx := v_idx + 1;
      if v_idx = v_count then
        -- Last row takes the remainder so the parts sum to the whole exactly.
        v_share := v_amount - v_allocated;
      elsif v_pending_total > 0 then
        v_share := round(v_amount::numeric * r.current_cents / v_pending_total)::int;
      else
        -- Every pending milestone is worth nothing yet: split evenly.
        v_share := round(v_amount::numeric / v_count)::int;
      end if;
      v_allocated := v_allocated + v_share;

      update public.estimate_milestones
      set milestone_type = 'flat',
          milestone_value = greatest(0, r.current_cents + v_share),
          amount_cents    = greatest(0, r.current_cents + v_share)
      where id = r.id;
    end loop;

  elsif v_treatment = 'final_milestone' and v_amount <> 0 then
    select id into v_target from _co_pending order by sort_order desc, id desc limit 1;
    update public.estimate_milestones m
    set milestone_type = 'flat',
        milestone_value = greatest(0, (select current_cents from _co_pending where id = m.id) + v_amount),
        amount_cents    = greatest(0, (select current_cents from _co_pending where id = m.id) + v_amount)
    where m.id = v_target;

  elsif v_treatment = 'own_milestone' and v_amount <> 0 then
    select coalesce(max(sort_order), -1) + 1 into v_next_sort
    from public.estimate_milestones
    where project_id = v_project_id and deleted_at is null;

    insert into public.estimate_milestones (
      org_id, project_id, name, milestone_type, milestone_value, amount_cents, sort_order, created_by
    ) values (
      v_org_id, v_project_id,
      trim(format('CO #%s%s', v_co_number, case when v_title <> '' then ' - ' || v_title else '' end)),
      'flat', greatest(0, v_amount), greatest(0, v_amount), v_next_sort, auth.uid()
    );
  end if;

  return query select p_change_order_id, v_new_contract;
end;
$$;

revoke execute on function public.approve_change_order(uuid, text) from public, anon;
grant execute on function public.approve_change_order(uuid, text) to authenticated;
