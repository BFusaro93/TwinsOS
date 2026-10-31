-- reverse_change_order never undid the cost side of what approve_change_order did: approving adds
-- project_change_orders.cost_impact_cents to projects.estimated_cost_cents, reversing left it in,
-- so a reversed change order kept inflating the project's cost (margin / WIP wrong). Reversal now
-- subtracts it (clamped at 0 like the approve side). Everything else is the live definition.
CREATE OR REPLACE FUNCTION public.reverse_change_order(p_change_order_id uuid, p_delete boolean DEFAULT true)
 RETURNS TABLE(change_order_id uuid, new_contract_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id     uuid;
  v_project_id uuid;
  v_status     text;
  v_alloc      jsonb;
  v_new_contract integer;
  v_cost       integer;
  v_ms_status  text;
  v_ms_name    text;
  r            jsonb;
begin
  if not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'Not permitted to reverse change orders'
      using errcode = 'insufficient_privilege';
  end if;

  select co.org_id, co.project_id, co.status, coalesce(co.billing_allocation, '[]'::jsonb), coalesce(co.cost_impact_cents, 0)
    into v_org_id, v_project_id, v_status, v_alloc, v_cost
    from public.project_change_orders co
    where co.id = p_change_order_id and co.deleted_at is null
    for update;

  if not found then
    raise exception 'Change order not found';
  end if;
  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;
  if v_status <> 'approved' then
    raise exception 'Only an approved change order can be reversed';
  end if;

  perform 1 from public.projects where id = v_project_id for update;

  for r in select e from jsonb_array_elements(v_alloc) e loop
    select status, name into v_ms_status, v_ms_name
    from public.estimate_milestones
    where id = (r->>'milestone_id')::uuid and deleted_at is null;

    if not found then
      continue;
    end if;
    if v_ms_status <> 'pending' then
      raise exception
        'Cannot reverse: milestone "%" has already been invoiced. Void or credit that invoice first.',
        v_ms_name
        using errcode = 'check_violation';
    end if;
  end loop;

  for r in select e from jsonb_array_elements(v_alloc) e loop
    if coalesce((r->>'created')::boolean, false) then
      update public.estimate_milestones
      set deleted_at = now()
      where id = (r->>'milestone_id')::uuid and deleted_at is null;
    else
      update public.estimate_milestones
      set milestone_value = greatest(0, milestone_value - (r->>'delta_cents')::int),
          amount_cents    = greatest(0, amount_cents    - (r->>'delta_cents')::int)
      where id = (r->>'milestone_id')::uuid and deleted_at is null;
    end if;
  end loop;

  perform set_config('app.change_order_rpc', p_change_order_id::text, true);

  update public.project_change_orders
  set status             = 'rejected',
      billing_allocation = null,
      approved_at        = null,
      approved_by        = null,
      deleted_at         = case when p_delete then now() else deleted_at end
  where id = p_change_order_id;

  -- Approving added the change order's cost impact to the project's estimated cost; reversing it
  -- must take it back out, or margin and WIP stay skewed by a change order that no longer exists.
  if v_cost <> 0 then
    update public.projects
    set estimated_cost_cents = greatest(0, estimated_cost_cents - v_cost)
    where id = v_project_id;
  end if;

  perform public.fn_recalc_project_contract_price(v_project_id);
  select contract_price into v_new_contract from public.projects where id = v_project_id;

  return query select p_change_order_id, v_new_contract;
end;
$function$
;
