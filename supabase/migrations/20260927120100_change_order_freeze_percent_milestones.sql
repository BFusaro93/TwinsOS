-- approve_change_order: billed + pending milestones must always sum to the
-- revised contract_price.
--
-- A PENDING percent milestone resolves against the project's live
-- contract_price (see 20260913193000). approve_change_order computed each
-- pending milestone's current amount against the OLD contract, then:
--   * final_milestone: flattened only the last pending milestone (old amount
--     + CO delta). Every OTHER pending percent milestone kept its percent and
--     re-resolved against the NEW contract — so the CO was billed once on the
--     final milestone and again, pro rata, on every earlier percent one.
--   * own_milestone: added a CO milestone for the delta and touched no pending
--     milestone — every pending percent milestone ALSO grew with the new
--     contract. Double billing again.
--   * distribute was already correct (it flattens every pending milestone).
--
-- Fix: before applying the CO, freeze every pending percent milestone to flat
-- cents at its CURRENT (pre-CO) resolved amount — exactly the value
-- v_pending already holds — then add the delta per the treatment. The sum of
-- pending amounts is then old-unbilled + delta, and billed + pending equals
-- the new contract.
--
-- A negative own_milestone with pending milestones used to change the
-- contract only, leaving pending milestones billing the removed scope. It now
-- comes off the pending milestones pro rata (recorded as 'distribute', and
-- guarded the same way: it can't exceed what is still unbilled). A negative CO
-- with NO pending milestone still changes the contract only — everything is
-- already billed, so the difference has to be credited on an invoice.
--
-- Reversal stays exact: freezes are not recorded in billing_allocation (they
-- change no amount — each frozen milestone is flat at the cents it already
-- resolved to), so reverse_change_order subtracts exactly the recorded deltas
-- and the contract returns to its old value with the frozen milestones
-- summing to it. They stay flat after a reversal, which is intentional: a
-- percent that silently re-resolves against a later contract is the bug.
--
-- Re-stated in full from the LIVE PROD definition (2026-09-27, = 20260924183000
-- removal guard). The permission guard stays FIRST (see 20260913170000), the
-- app.change_order_rpc GUC is still set before the change order is touched,
-- and every removal guard is kept.

create or replace function public.approve_change_order(p_change_order_id uuid, p_treatment text default null::text)
 returns table(change_order_id uuid, new_contract_cents integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org_id       uuid;
  v_project_id   uuid;
  v_status       text;
  v_amount       integer;
  v_cost         integer;
  v_treatment    text;
  v_title        text;
  v_co_number    integer;
  v_old_contract integer;
  v_new_contract integer;
  v_pending      jsonb;
  v_pending_total bigint := 0;
  v_count        integer := 0;
  v_allocated    bigint := 0;
  v_share        integer;
  v_idx          integer := 0;
  v_alloc        jsonb := '[]'::jsonb;
  v_target       uuid;
  v_target_cents integer;
  v_new_ms       uuid;
  v_next_sort    integer;
  r              jsonb;
begin
  -- MUST stay first, and must be re-stated by any future `create or replace`
  -- of this function. See 20260913170000 for how this guard gets lost.
  if not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'Not permitted to approve change orders'
      using errcode = 'insufficient_privilege';
  end if;

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

  select contract_price into v_old_contract
    from public.projects where id = v_project_id for update;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'cents', t.current_cents)
                            order by t.sort_order, t.id), '[]'::jsonb)
    into v_pending
  from (
    select m.id, m.sort_order,
           case
             when m.milestone_type = 'percent' and coalesce(v_old_contract, 0) > 0
               then round(v_old_contract::numeric * m.milestone_value / 10000)::int
             else m.amount_cents
           end as current_cents
    from public.estimate_milestones m
    where m.project_id = v_project_id
      and m.status = 'pending'
      and m.deleted_at is null
  ) t;

  v_count := jsonb_array_length(v_pending);
  select coalesce(sum((e->>'cents')::int), 0) into v_pending_total
  from jsonb_array_elements(v_pending) e;

  if v_treatment in ('distribute', 'final_milestone') and v_count = 0 then
    v_treatment := 'own_milestone';
  end if;

  -- Removed scope with somewhere to come off: a separate negative milestone
  -- can't exist, so take it off the unbilled milestones pro rata.
  if v_amount < 0 and v_treatment = 'own_milestone' and v_count > 0 then
    v_treatment := 'distribute';
  end if;

  -- Removed scope has to come off money that hasn't been billed yet.
  if v_amount < 0 and v_treatment = 'distribute' and -v_amount > v_pending_total then
    raise exception 'This change order removes %, but only % is still unbilled on this project''s milestones.',
      to_char(-v_amount / 100.0, 'FM$999,999,990.00'), to_char(v_pending_total / 100.0, 'FM$999,999,990.00')
      using errcode = 'check_violation';
  end if;
  if v_amount < 0 and v_treatment = 'final_milestone' then
    select (t.e->>'cents')::int into v_target_cents
    from jsonb_array_elements(v_pending) with ordinality as t(e, ord)
    order by t.ord desc limit 1;
    if -v_amount > coalesce(v_target_cents, 0) then
      raise exception 'This change order removes %, more than the % left on the final milestone. Spread it across the remaining milestones instead.',
        to_char(-v_amount / 100.0, 'FM$999,999,990.00'), to_char(coalesce(v_target_cents, 0) / 100.0, 'FM$999,999,990.00')
        using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('app.change_order_rpc', p_change_order_id::text, true);

  update public.project_change_orders
  set status = 'approved', approved_at = now(), approved_by = auth.uid(),
      billing_treatment = v_treatment
  where id = p_change_order_id;

  if v_cost <> 0 then
    update public.projects
    set estimated_cost_cents = greatest(0, estimated_cost_cents + v_cost)
    where id = v_project_id;
  end if;

  perform public.fn_recalc_project_contract_price(v_project_id);
  select contract_price into v_new_contract from public.projects where id = v_project_id;

  if v_new_contract < 0 then
    raise exception 'This change order would make the contract negative (%).',
      to_char(v_new_contract / 100.0, 'FM$999,999,990.00')
      using errcode = 'check_violation';
  end if;

  -- Freeze every pending percent milestone at its pre-CO amount, so none of
  -- them re-resolves against the new contract_price. Not recorded in
  -- billing_allocation: the amount doesn't change (see header).
  if v_amount <> 0 then
    update public.estimate_milestones m
    set milestone_type  = 'flat',
        milestone_value = (e->>'cents')::int,
        amount_cents    = (e->>'cents')::int
    from jsonb_array_elements(v_pending) e
    where m.id = (e->>'id')::uuid
      and m.milestone_type = 'percent';
  end if;

  if v_treatment = 'distribute' and v_amount <> 0 then
    for r in select e from jsonb_array_elements(v_pending) e loop
      v_idx := v_idx + 1;
      if v_idx = v_count then
        v_share := v_amount - v_allocated;
      elsif v_pending_total > 0 then
        v_share := round(v_amount::numeric * (r->>'cents')::int / v_pending_total)::int;
      else
        v_share := round(v_amount::numeric / v_count)::int;
      end if;
      -- Never take a milestone below zero; carry what it can't absorb to the
      -- next one so the recorded delta always equals the real change.
      if (r->>'cents')::int + v_share < 0 then
        v_share := -((r->>'cents')::int);
      end if;
      v_allocated := v_allocated + v_share;

      update public.estimate_milestones
      set milestone_type  = 'flat',
          milestone_value = (r->>'cents')::int + v_share,
          amount_cents    = (r->>'cents')::int + v_share
      where id = (r->>'id')::uuid;

      v_alloc := v_alloc || jsonb_build_array(jsonb_build_object(
        'milestone_id', r->>'id', 'delta_cents', v_share, 'created', false));
    end loop;

  elsif v_treatment = 'final_milestone' and v_amount <> 0 then
    select (t.e->>'id')::uuid, (t.e->>'cents')::int into v_target, v_target_cents
    from jsonb_array_elements(v_pending) with ordinality as t(e, ord)
    order by t.ord desc limit 1;

    update public.estimate_milestones
    set milestone_type  = 'flat',
        milestone_value = v_target_cents + v_amount,
        amount_cents    = v_target_cents + v_amount
    where id = v_target;

    v_alloc := jsonb_build_array(jsonb_build_object(
      'milestone_id', v_target, 'delta_cents', v_amount, 'created', false));

  elsif v_treatment = 'own_milestone' and v_amount > 0 then
    select coalesce(max(sort_order), -1) + 1 into v_next_sort
    from public.estimate_milestones
    where project_id = v_project_id and deleted_at is null;

    insert into public.estimate_milestones (
      org_id, project_id, name, milestone_type, milestone_value, amount_cents, sort_order, created_by
    ) values (
      v_org_id, v_project_id,
      trim(format('CO #%s%s', v_co_number, case when v_title <> '' then ' - ' || v_title else '' end)),
      'flat', v_amount, v_amount, v_next_sort, auth.uid()
    )
    returning id into v_new_ms;

    v_alloc := jsonb_build_array(jsonb_build_object(
      'milestone_id', v_new_ms, 'delta_cents', v_amount, 'created', true));
  end if;
  -- own_milestone with a negative amount and NO pending milestone: nothing
  -- unbilled to take it from, so the contract changes and no milestone is
  -- created (v_alloc stays empty); the office credits it on an invoice.

  update public.project_change_orders
  set billing_allocation = v_alloc
  where id = p_change_order_id;

  return query select p_change_order_id, v_new_contract;
end;
$function$;

revoke all on function public.approve_change_order(uuid, text) from public, anon;
grant execute on function public.approve_change_order(uuid, text) to authenticated, service_role;
