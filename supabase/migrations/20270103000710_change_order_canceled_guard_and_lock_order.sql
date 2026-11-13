-- Change orders & milestone invoicing: canceled projects, and one lock order (audit r13 F4/F5).
--
-- 1. A CANCELED project refuses change-order approval (_approve_change_order — the body of
--    approve_change_order() and of link_estimate_to_project()'s add-on approval) and milestone
--    invoicing (create_invoice_from_milestone). Reopen the project first. Change orders on a
--    COMPLETED project stay allowed (the UI warns before approving).
-- 2. Race: approving / reversing a change order reshapes PENDING milestones while
--    create_invoice_from_milestone could be invoicing one of them. The CO RPCs now lock the
--    project, then the project's live milestones FOR UPDATE, and every milestone update they make
--    is guarded with status = 'pending' and a row-count check. create_invoice_from_milestone
--    locks the project row BEFORE the milestone, the same order, so the two serialize instead of
--    one re-pricing a milestone the other just billed (or billing a stale amount).
-- 3. reverse_change_order also unwinds its billing_allocation on milestones a project cancel
--    removed (estimate_milestones.canceled_with_project_at, 20270103000700), so a restore after
--    reopening brings them back without that change order's share.
--
-- Bodies are the LIVE TEST definitions plus the changes above; every permission check, the
-- app.change_order_rpc GUC handshake and the org checks are unchanged.
--
-- PROD: apply BEFORE the code deploy (after 20270103000700). Old code keeps working: the only new
-- behaviour it can see is the canceled-project refusal message.

CREATE OR REPLACE FUNCTION public._approve_change_order(p_change_order_id uuid, p_treatment text DEFAULT NULL::text)
 RETURNS TABLE(change_order_id uuid, new_contract_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_pretax       boolean := false;
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
  v_old_eac      integer;
  v_eac_applied  integer := 0;
  v_seed         uuid;
  v_proj_status  text;
  v_rows         integer;
  r              jsonb;
begin
  -- NO permission check here on purpose: this is the body of approve_change_order(), which checks
  -- sched_add_modify_projects first, and of link_estimate_to_project(), which approves an add-on
  -- estimate's change order on a job conversion. EXECUTE is revoked from every API role.

  select co.org_id, co.project_id, co.status, co.amount_cents, co.cost_impact_cents,
         coalesce(p_treatment, co.billing_treatment), co.title, co.co_number
    into v_org_id, v_project_id, v_status, v_amount, v_cost, v_treatment, v_title, v_co_number
    from public.project_change_orders co
    where co.id = p_change_order_id and co.deleted_at is null
    for update;

  if not found then
    raise exception 'Change order not found';
  end if;
  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;
  if v_status = 'approved' then
    raise exception 'Change order already approved';
  end if;

  select contract_price, coalesce(contract_price_is_pretax, false), coalesce(estimated_cost_cents, 0),
         source_estimate_id, status
    into v_old_contract, v_pretax, v_old_eac, v_seed, v_proj_status
    from public.projects where id = v_project_id for update;

  -- A canceled project takes no more scope: its pending milestones were removed and nothing more
  -- can be billed. Reopen it first. (A COMPLETED project still takes change orders.)
  if v_proj_status = 'canceled' then
    raise exception 'This project is canceled. Reopen it before approving change orders.'
      using errcode = 'check_violation';
  end if;

  -- Lock order shared with reverse_change_order and create_invoice_from_milestone: project, then
  -- its live milestones. A milestone being invoiced right now is either finished (and read below
  -- as invoiced) or waits until this approval has re-priced the schedule.
  perform 1 from public.estimate_milestones
   where project_id = v_project_id and deleted_at is null
   order by id
   for update;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'cents', t.current_cents)
                            order by t.sort_order, t.id), '[]'::jsonb)
    into v_pending
  from (
    select m.id, m.sort_order,
           case
             -- A percent milestone's current amount on its own basis: the contract for the
             -- estimate that seeded the project, an add-on estimate's own total for an add-on's
             -- (20261230000400), with the last pending percent row taking the rounding remainder.
             when m.milestone_type = 'percent' and public._milestone_percent_amount_cents(m.id) is not null
               then public._milestone_percent_amount_cents(m.id)
             -- A flat milestone carried from a taxed estimate holds a GROSS figure. On a pre-tax
             -- project every amount the change order produces is pre-tax, so bring it to the same
             -- basis (the estimate's net share) before adding to it.
             when v_pretax and m.estimate_id is not null and not coalesce(m.amount_is_pretax, false)
                  and coalesce(e.total_cents, 0) > 0 and coalesce(e.tax_cents, 0) > 0
               then round(m.amount_cents::numeric * (e.total_cents - e.tax_cents) / e.total_cents)::int
             else m.amount_cents
           end as current_cents
    from public.estimate_milestones m
    left join public.estimates e on e.id = m.estimate_id
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

  -- Record the EAC change actually applied (the floor at 0 can make it smaller than the cost
  -- impact), so reverse_change_order() takes back exactly this much.
  if v_cost <> 0 then
    v_eac_applied := greatest(0, v_old_eac + v_cost) - v_old_eac;
    update public.projects
    set estimated_cost_cents = v_old_eac + v_eac_applied
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
    set milestone_type   = 'flat',
        milestone_value  = (e->>'cents')::int,
        amount_cents     = (e->>'cents')::int,
        -- A percent of a pre-tax contract is a pre-tax amount: tax still goes on top when billed.
        amount_is_pretax = v_pretax
    from jsonb_array_elements(v_pending) e
    where m.id = (e->>'id')::uuid
      and m.status = 'pending'
      and m.deleted_at is null
      and m.milestone_type = 'percent'
      -- An add-on estimate's percent rows bill against that estimate's own total, which no
      -- change order moves: they keep their percentages.
      and not (m.estimate_id is not null and v_seed is not null and m.estimate_id <> v_seed);

    -- An INVOICED percent milestone is frozen too: if its invoice is later voided it returns to
    -- pending and would otherwise re-resolve against the new contract price and over-bill.
    update public.estimate_milestones m
    set milestone_type   = 'flat',
        milestone_value  = m.amount_cents,
        amount_is_pretax = v_pretax
    where m.project_id = v_project_id
      and m.status = 'invoiced'
      and m.milestone_type = 'percent'
      and not (m.estimate_id is not null and v_seed is not null and m.estimate_id <> v_seed)
      and m.deleted_at is null
      and coalesce(m.amount_cents, 0) > 0;
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
      set milestone_type   = 'flat',
          milestone_value  = (r->>'cents')::int + v_share,
          amount_cents     = (r->>'cents')::int + v_share,
          amount_is_pretax = v_pretax
      where id = (r->>'id')::uuid
        and status = 'pending'
        and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'A milestone on this project was invoiced or removed while the change order was being approved. Refresh and try again.'
          using errcode = 'serialization_failure';
      end if;

      v_alloc := v_alloc || jsonb_build_array(jsonb_build_object(
        'milestone_id', r->>'id', 'delta_cents', v_share, 'created', false));
    end loop;

  elsif v_treatment = 'final_milestone' and v_amount <> 0 then
    select (t.e->>'id')::uuid, (t.e->>'cents')::int into v_target, v_target_cents
    from jsonb_array_elements(v_pending) with ordinality as t(e, ord)
    order by t.ord desc limit 1;

    update public.estimate_milestones
    set milestone_type   = 'flat',
        milestone_value  = v_target_cents + v_amount,
        amount_cents     = v_target_cents + v_amount,
        amount_is_pretax = v_pretax
    where id = v_target
      and status = 'pending'
      and deleted_at is null;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'A milestone on this project was invoiced or removed while the change order was being approved. Refresh and try again.'
        using errcode = 'serialization_failure';
    end if;

    v_alloc := jsonb_build_array(jsonb_build_object(
      'milestone_id', v_target, 'delta_cents', v_amount, 'created', false));

  elsif v_treatment = 'own_milestone' and v_amount > 0 then
    select coalesce(max(sort_order), -1) + 1 into v_next_sort
    from public.estimate_milestones
    where project_id = v_project_id and deleted_at is null;

    insert into public.estimate_milestones (
      org_id, project_id, name, milestone_type, milestone_value, amount_cents, sort_order, created_by, amount_is_pretax
    ) values (
      v_org_id, v_project_id,
      trim(format('CO #%s%s', v_co_number, case when v_title <> '' then ' - ' || v_title else '' end)),
      'flat', v_amount, v_amount, v_next_sort, auth.uid(), v_pretax
    )
    returning id into v_new_ms;

    v_alloc := jsonb_build_array(jsonb_build_object(
      'milestone_id', v_new_ms, 'delta_cents', v_amount, 'created', true));
  end if;
  -- own_milestone with a negative amount and NO pending milestone: nothing
  -- unbilled to take it from, so the contract changes and no milestone is
  -- created (v_alloc stays empty); the office credits it on an invoice.

  update public.project_change_orders
  set billing_allocation      = v_alloc,
      eac_delta_applied_cents = v_eac_applied
  where id = p_change_order_id;

  return query select p_change_order_id, v_new_contract;
end;
$function$;

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
  v_estimate   uuid;
  v_est_number integer;
  v_proj_status text;
  v_canceled   boolean := false;
  v_targets    jsonb := '[]'::jsonb;
  v_rows       integer;
begin
  if not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'Not permitted to reverse change orders'
      using errcode = 'insufficient_privilege';
  end if;

  -- The EAC change approval actually applied (it is floored at 0, so it can be smaller than the
  -- cost impact); change orders approved before it was recorded fall back to the cost impact.
  select co.org_id, co.project_id, co.status, coalesce(co.billing_allocation, '[]'::jsonb),
         coalesce(co.eac_delta_applied_cents, co.cost_impact_cents, 0), co.estimate_id
    into v_org_id, v_project_id, v_status, v_alloc, v_cost, v_estimate
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

  select status into v_proj_status from public.projects where id = v_project_id for update;
  v_canceled := v_proj_status = 'canceled';

  -- Lock order shared with _approve_change_order and create_invoice_from_milestone: project, then
  -- its milestones — the live ones and, on a canceled project, the ones the cancel removed (a
  -- restore on reopen brings those back, so the reversal must come off them too).
  perform 1 from public.estimate_milestones
   where project_id = v_project_id
     and (deleted_at is null or (v_canceled and canceled_with_project_at is not null))
   order by id
   for update;

  -- An add-on estimate's change order: the estimate's own milestones carry its billing on this
  -- project, so reversing the price alone would leave them billing scope that is no longer in
  -- the contract.
  if v_estimate is not null and exists (
       select 1 from public.estimate_milestones m
        where m.project_id = v_project_id and m.estimate_id = v_estimate and m.deleted_at is null) then
    select estimate_number into v_est_number from public.estimates where id = v_estimate;
    raise exception 'This change order is add-on estimate #% on this project, and that estimate''s billing milestones are still on the project. Remove them first, then reverse it.',
      coalesce(v_est_number::text, '?')
      using errcode = 'check_violation';
  end if;

  for r in select e from jsonb_array_elements(v_alloc) e loop
    select status, name into v_ms_status, v_ms_name
    from public.estimate_milestones
    where id = (r->>'milestone_id')::uuid
      and (deleted_at is null or (v_canceled and canceled_with_project_at is not null));

    if not found then
      continue;
    end if;
    if v_ms_status <> 'pending' then
      raise exception
        'Cannot reverse: milestone "%" has already been invoiced. Void or credit that invoice first.',
        v_ms_name
        using errcode = 'check_violation';
    end if;
    v_targets := v_targets || jsonb_build_array(r);
  end loop;

  for r in select e from jsonb_array_elements(v_targets) e loop
    if coalesce((r->>'created')::boolean, false) then
      -- The change order's own milestone goes. If a cancel already removed it, it just stops
      -- being restorable.
      update public.estimate_milestones
      set deleted_at = coalesce(deleted_at, now()),
          canceled_with_project_at = null
      where id = (r->>'milestone_id')::uuid
        and status = 'pending'
        and (deleted_at is null or (v_canceled and canceled_with_project_at is not null));
    else
      update public.estimate_milestones
      set milestone_value = greatest(0, milestone_value - (r->>'delta_cents')::int),
          amount_cents    = greatest(0, amount_cents    - (r->>'delta_cents')::int)
      where id = (r->>'milestone_id')::uuid
        and status = 'pending'
        and (deleted_at is null or (v_canceled and canceled_with_project_at is not null));
    end if;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'A milestone on this project was invoiced or removed while the change order was being reversed. Refresh and try again.'
        using errcode = 'serialization_failure';
    end if;
  end loop;

  perform set_config('app.change_order_rpc', p_change_order_id::text, true);

  update public.project_change_orders
  set status             = 'rejected',
      billing_allocation = null,
      approved_at        = null,
      approved_by        = null,
      eac_delta_applied_cents = null,
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
$function$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_milestone(p_milestone_id uuid, p_client_id uuid, p_sales_rep_id uuid DEFAULT NULL::uuid, p_po_number text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id      uuid;
  v_estimate_id uuid;
  v_project_id  uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_type        text;
  v_value       integer;
  v_basis       integer;
  v_invoice_id  uuid;
  v_deleted_at  timestamptz;
  v_client_id   uuid;
  v_est_client  uuid;
  v_proj_client uuid;
  v_terms       text;
  v_inv_date    date;
  v_days        integer;
  v_pretax      boolean := false;
  v_est_rate    integer;
  v_client_rate integer;
  v_client_taxable boolean;
  v_tax_rate    integer := 0;
  v_tax         integer := 0;
  v_est_tax     integer;
  v_est_total   integer;
  v_net         integer;
  v_amt_pretax  boolean := false;
  v_lock_org    uuid;
  v_lock_est    uuid;
  v_lock_proj   uuid;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to invoice a milestone' using errcode = '42501';
  end if;

  -- Lock order shared with approve/reverse_change_order: the milestone's project FIRST, then the
  -- milestone. A change order re-pricing the schedule finishes before this reads the amount (or
  -- waits until this invoice is created and sees the milestone as invoiced).
  select org_id, estimate_id, project_id into v_lock_org, v_lock_est, v_lock_proj
    from public.estimate_milestones where id = p_milestone_id;
  if found then
    if public._org_mismatch(v_lock_org) then
      raise exception 'Unauthorized';
    end if;
    if v_lock_proj is null and v_lock_est is not null then
      select j.project_id into v_lock_proj
      from public.crm_jobs j
      where j.estimate_id = v_lock_est
        and j.project_id is not null
        and j.deleted_at is null
      limit 1;
    end if;
    if v_lock_proj is not null then
      perform 1 from public.projects where id = v_lock_proj for update;
    end if;
  end if;

  select org_id, estimate_id, project_id, name, amount_cents, status, milestone_type, milestone_value, deleted_at,
         coalesce(amount_is_pretax, false)
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status, v_type, v_value, v_deleted_at,
         v_amt_pretax
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if v_deleted_at is not null then
    raise exception 'Milestone has been deleted';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  if v_estimate_id is not null then
    declare
      v_est_deleted timestamptz;
      v_est_stage   text;
      v_est_org     uuid;
    begin
      select deleted_at, stage, org_id, client_id, tax_rate_bps, tax_cents, total_cents
        into v_est_deleted, v_est_stage, v_est_org, v_est_client, v_est_rate, v_est_tax, v_est_total
        from public.estimates where id = v_estimate_id;
      if not found or v_est_deleted is not null then
        raise exception 'Milestone''s estimate has been deleted';
      end if;
      if v_est_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
      if v_est_stage = 'lost' then
        raise exception 'Cannot invoice a milestone on a lost estimate';
      end if;
    end;
  end if;

  if v_project_id is distinct from v_lock_proj then
    raise exception 'This milestone was moved to another project while it was being invoiced. Refresh and try again.'
      using errcode = 'serialization_failure';
  end if;

  if v_project_id is not null then
    declare
      v_proj_deleted timestamptz;
      v_proj_org     uuid;
      v_proj_status  text;
    begin
      select deleted_at, org_id, client_id, contract_price_is_pretax, status
        into v_proj_deleted, v_proj_org, v_proj_client, v_pretax, v_proj_status
        from public.projects where id = v_project_id;
      if not found or v_proj_deleted is not null then
        raise exception 'Milestone''s project has been deleted';
      end if;
      if v_proj_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
      -- Nothing more is billed from a canceled project's schedule. Reopen it first.
      if v_proj_status = 'canceled' then
        raise exception 'This project is canceled. Reopen it before invoicing its milestones.'
          using errcode = 'check_violation';
      end if;
    end;
  end if;

  v_client_id := coalesce(v_est_client, v_proj_client);
  if v_client_id is null then
    if not exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.org_id = v_org_id and c.deleted_at is null
    ) then
      raise exception 'Invalid client for this milestone';
    end if;
    v_client_id := p_client_id;
  elsif p_client_id is not null and p_client_id is distinct from v_client_id then
    raise exception 'Client does not match the milestone''s estimate/project';
  end if;

  -- A percent milestone bills against its own basis (_milestone_percent_amount_cents): the
  -- project contract for the estimate that seeded the project (or a project's own row), an
  -- add-on estimate's own total for that estimate's rows, the estimate total off a project. The
  -- last pending percent row of a basis takes the rounding remainder, so 50/50 of an odd-cent
  -- total adds up exactly. NULL = no positive basis: keep the stored amount, as before.
  if v_type = 'percent' then
    v_basis := public._milestone_percent_amount_cents(p_milestone_id);
    if v_basis is not null then
      v_amount := v_basis;
    end if;
  end if;

  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Milestone amount must be greater than zero';
  end if;

  -- Tax, pre-tax projects only. Same precedence as every other invoice path
  -- (resolveAutoInvoiceTaxRateBps): the estimate's rate when set, else the
  -- client's default rate; 0 means exempt/untaxed. A flat milestone carried
  -- from an estimate is a literal gross figure, so it is left untaxed.
  -- amount_is_pretax: a milestone a change order froze or re-priced on a pre-tax project holds a
  -- pre-tax figure even though it still carries the estimate it came from.
  if v_pretax and (v_type = 'percent' or v_estimate_id is null or v_amt_pretax) then
    select default_tax_rate_bps, is_taxable into v_client_rate, v_client_taxable from public.clients where id = v_client_id;
    -- A tax-exempt client (is_taxable = false) is never taxed, whatever rate the estimate or
    -- the client's default carries — the same rule every other invoice path applies (#387).
    if v_client_taxable is false then
      v_tax_rate := 0;
    else
      v_tax_rate := least(10000, greatest(0, case when coalesce(v_est_rate, 0) > 0 then v_est_rate else coalesce(v_client_rate, 0) end));
    end if;
    v_tax := round(v_amount::numeric * v_tax_rate / 10000);
  end if;

  -- A milestone billed against an estimate's tax-INCLUSIVE total (percent of it, or a flat gross
  -- figure) bills the same amount as before, but records the tax portion it contains: without
  -- it the invoice showed no tax, and the tax reports and the QuickBooks tax push under-counted.
  v_net := v_amount;
  -- (Not for a percent milestone of a pre-tax project: that amount is pre-tax and an exempt client
  -- owes none.)
  if v_tax = 0 and v_estimate_id is not null and not (v_pretax and (v_type = 'percent' or v_amt_pretax))
     and coalesce(v_est_tax, 0) > 0 and coalesce(v_est_total, 0) > 0 then
    v_tax := least(v_amount, round(v_amount::numeric * v_est_tax / v_est_total));
    v_tax_rate := least(10000, greatest(0, coalesce(v_est_rate, 0)));
    v_net := v_amount - v_tax;
  end if;

  select terms into v_terms from (
    select c.default_terms as terms, 1 as pri from public.clients c where c.id = v_client_id
    union all
    select o.default_billing_terms, 2 from public.organizations o where o.id = v_org_id
  ) t
  where terms in ('due_on_receipt','net_10','net_15','net_30','net_45','net_60','net_90')
  order by pri
  limit 1;
  v_terms := coalesce(v_terms, 'due_on_receipt');
  v_days := case v_terms
    when 'net_10' then 10 when 'net_15' then 15 when 'net_30' then 30
    when 'net_45' then 45 when 'net_60' then 60 when 'net_90' then 90
    else 0 end;
  v_inv_date := public.org_today(v_org_id);

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, terms, due_date, po_number,
    subtotal_cents, tax_rate_bps, tax_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), v_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    v_inv_date, v_terms, v_inv_date + v_days,
    p_po_number, v_net, v_tax_rate, v_tax, v_net + v_tax, v_net + v_tax, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, is_taxable, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_net, v_net, v_tax > 0, 0
  );

  -- amount_cents stays the PRE-tax milestone amount.
  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$function$;

