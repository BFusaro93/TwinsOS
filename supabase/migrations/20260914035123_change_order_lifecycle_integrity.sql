-- Change-order integrity: make the contract price and the billing schedule
-- impossible to separate.
--
-- 20260913211000 established the rule that an approved change order applies
-- its amount to the PENDING milestones so the schedule always re-totals to the
-- revised contract. approve_change_order honours that. Nothing else did, and
-- the invariant is only as strong as its weakest writer. Measured on PROD
-- (probes rolled back), on a $40,000 contract billed 50/50 with a $20,000 CO:
--
--   1. The "Reverse" button (ChangeOrdersTab, a soft delete via
--      useDeleteChangeOrder) dropped contract_price back to $40,000 and left
--      the milestones at $60,000. Its own code comment claims the opposite:
--      "the trigger recomputes the contract price, so the schedule can't be
--      left richer than the contract that justifies it." It can. The client is
--      over-billed by the whole change order.
--
--   2. Approving by plain UPDATE -- `status = 'approved'`, which is exactly
--      what useUpdateChangeOrder's own patch type exposes, and what any signed
--      -in user can send with the publishable key -- moved contract_price to
--      $60,000 and left the schedule at $40,000. The client is UNDER-billed by
--      the whole change order, and rpt_projects_wip reads the gap as margin.
--
--   3. Approved -> rejected by the same route: $40,000 contract, $50,000
--      schedule (measured on a $10,000 CO).
--
-- Editing amount_cents on an already-approved CO has the same shape: the AFTER
-- trigger recomputes the price, the milestones never move.
--
-- Two changes close all of it:
--
--   * An approval now RECORDS what it did (billing_allocation), so a reversal
--     can undo exactly that and nothing else. Reversing is its own RPC.
--   * A BEFORE trigger refuses every out-of-band transition into or out of
--     'approved'. The RPCs announce themselves with a session-local GUC; there
--     is no other way in, from the browser or from PostgREST.
--
-- approve_change_order also gains the server-side permission check it never
-- had. The UI gates the button on can("sched_add_modify_projects"); the RPC
-- checked only org membership, so the gate was advisory. This is the same
-- defect, and the same fix, as 20260913170000 on crm_apply_price_adjustment.

alter table public.project_change_orders
  add column if not exists billing_allocation jsonb;

comment on column public.project_change_orders.billing_allocation is
  'What approving this CO did to the billing schedule: [{milestone_id, delta_cents, created}]. Written by approve_change_order, consumed by reverse_change_order, cleared on reversal. Null on a CO that was never approved.';

-- ── approve ──────────────────────────────────────────────────────────────────
-- Unchanged in arithmetic from 20260913211000 -- the distribution rule, the
-- exact-cents remainder on the last row, and the own_milestone/final_milestone
-- fallbacks are all as they were. What is new: the permission guard, the
-- recorded allocation, the GUC that lets the guard trigger recognise us, and a
-- jsonb snapshot in place of the temp table (a `create temp table ... on commit
-- drop` inside a function is re-created per transaction on a pooled
-- connection, which is a cached-plan hazard for no benefit here).
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

  -- Lock the project too: two COs approving at once must not both read the
  -- same pending milestone amounts and each distribute against a stale base.
  select contract_price into v_old_contract
    from public.projects where id = v_project_id for update;

  -- Snapshot what each PENDING milestone is worth under the OLD contract,
  -- before the price moves. Percent milestones resolve live, matching
  -- create_invoice_from_milestone.
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

  -- Announce ourselves to the guard trigger for the rest of this transaction.
  perform set_config('app.change_order_rpc', p_change_order_id::text, true);

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
    for r in select e from jsonb_array_elements(v_pending) e loop
      v_idx := v_idx + 1;
      if v_idx = v_count then
        -- Last row takes the remainder so the parts sum to the whole exactly.
        v_share := v_amount - v_allocated;
      elsif v_pending_total > 0 then
        v_share := round(v_amount::numeric * (r->>'cents')::int / v_pending_total)::int;
      else
        -- Every pending milestone is worth nothing yet: split evenly.
        v_share := round(v_amount::numeric / v_count)::int;
      end if;
      v_allocated := v_allocated + v_share;

      update public.estimate_milestones
      set milestone_type  = 'flat',
          milestone_value = greatest(0, (r->>'cents')::int + v_share),
          amount_cents    = greatest(0, (r->>'cents')::int + v_share)
      where id = (r->>'id')::uuid;

      v_alloc := v_alloc || jsonb_build_array(jsonb_build_object(
        'milestone_id', r->>'id', 'delta_cents', v_share, 'created', false));
    end loop;

  elsif v_treatment = 'final_milestone' and v_amount <> 0 then
    -- v_pending is already ordered by sort_order, so the last element is the
    -- final milestone.
    select (t.e->>'id')::uuid, (t.e->>'cents')::int into v_target, v_target_cents
    from jsonb_array_elements(v_pending) with ordinality as t(e, ord)
    order by t.ord desc limit 1;

    update public.estimate_milestones
    set milestone_type  = 'flat',
        milestone_value = greatest(0, v_target_cents + v_amount),
        amount_cents    = greatest(0, v_target_cents + v_amount)
    where id = v_target;

    v_alloc := jsonb_build_array(jsonb_build_object(
      'milestone_id', v_target, 'delta_cents', v_amount, 'created', false));

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
    )
    returning id into v_new_ms;

    v_alloc := jsonb_build_array(jsonb_build_object(
      'milestone_id', v_new_ms, 'delta_cents', v_amount, 'created', true));
  end if;

  update public.project_change_orders
  set billing_allocation = v_alloc
  where id = p_change_order_id;

  return query select p_change_order_id, v_new_contract;
end;
$$;

revoke execute on function public.approve_change_order(uuid, text) from public, anon;
grant execute on function public.approve_change_order(uuid, text) to authenticated;

-- ── reverse ──────────────────────────────────────────────────────────────────
-- Undoes exactly what the approval recorded, or refuses.
--
-- It refuses when an affected milestone has already been INVOICED, because
-- part of the change order is then money the client has been billed. Silently
-- dropping the contract price under a sent invoice is the over-bill this whole
-- migration exists to stop; the honest answer is that the invoice has to be
-- voided or credited first, and the message says so.
create or replace function public.reverse_change_order(
  p_change_order_id uuid,
  p_delete          boolean default true
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
  v_alloc      jsonb;
  v_new_contract integer;
  v_ms_status  text;
  v_ms_name    text;
  r            jsonb;
begin
  if not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'Not permitted to reverse change orders'
      using errcode = 'insufficient_privilege';
  end if;

  select co.org_id, co.project_id, co.status, coalesce(co.billing_allocation, '[]'::jsonb)
    into v_org_id, v_project_id, v_status, v_alloc
    from public.project_change_orders co
    where co.id = p_change_order_id and co.deleted_at is null
    for update;

  if not found then
    raise exception 'Change order not found';
  end if;
  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;
  if v_status <> 'approved' then
    raise exception 'Only an approved change order can be reversed';
  end if;

  perform 1 from public.projects where id = v_project_id for update;

  -- Check every affected milestone BEFORE touching any of them, so a refusal
  -- leaves the schedule exactly as it was.
  for r in select e from jsonb_array_elements(v_alloc) e loop
    select status, name into v_ms_status, v_ms_name
    from public.estimate_milestones
    where id = (r->>'milestone_id')::uuid and deleted_at is null;

    if not found then
      continue;  -- already removed; nothing of this CO is left on it
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

  perform public.fn_recalc_project_contract_price(v_project_id);
  select contract_price into v_new_contract from public.projects where id = v_project_id;

  return query select p_change_order_id, v_new_contract;
end;
$$;

revoke execute on function public.reverse_change_order(uuid, boolean) from public, anon;
grant execute on function public.reverse_change_order(uuid, boolean) to authenticated;

-- ── the guard ────────────────────────────────────────────────────────────────
-- Everything above is pointless if the status column stays freely writable.
-- Crossing the 'approved' boundary, and editing the money on a CO that has
-- already crossed it, are RPC-only from here.
create or replace function public.fn_project_change_orders_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_via_rpc boolean := coalesce(
    nullif(current_setting('app.change_order_rpc', true), ''), '') = new.id::text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' and not v_via_rpc then
      raise exception 'A change order cannot be created already approved — use approve_change_order()'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if v_via_rpc then
    return new;
  end if;

  if old.status = 'approved' and new.status <> 'approved' then
    raise exception 'Use reverse_change_order() to reverse an approved change order — the billing schedule has to be unwound with it'
      using errcode = 'check_violation';
  end if;
  if old.status = 'approved' and new.deleted_at is not null and old.deleted_at is null then
    raise exception 'Use reverse_change_order() to reverse an approved change order — deleting it would leave the milestones billing the old amount'
      using errcode = 'check_violation';
  end if;
  if old.status <> 'approved' and new.status = 'approved' then
    raise exception 'Use approve_change_order() to approve — approving directly would leave the contract price and the milestones disagreeing'
      using errcode = 'check_violation';
  end if;
  if old.status = 'approved'
     and (new.amount_cents is distinct from old.amount_cents
          or new.billing_treatment is distinct from old.billing_treatment) then
    raise exception 'An approved change order''s amount is fixed — reverse it and raise a new one'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_project_change_orders_guard() from public, anon;

drop trigger if exists trg_project_change_orders_guard on public.project_change_orders;
create trigger trg_project_change_orders_guard
  before insert or update on public.project_change_orders
  for each row execute function public.fn_project_change_orders_guard();

-- ── consistency with every other CRM table ───────────────────────────────────
-- project_change_orders shipped with bare `org_id = my_org_id()` policies. It
-- is the only table added since the has_crm_access() rollout that carries
-- neither the RESTRICTIVE policy nor an inline gate, so a non-CRM member of the
-- org (an Equipt-only technician, a client-portal login) could read and write
-- the org's change orders.
do $do$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_change_orders'
      and policyname = 'require_crm_access'
  ) then
    create policy "require_crm_access" on public.project_change_orders
      as restrictive for all
      using (public.has_crm_access())
      with check (public.has_crm_access());
  end if;
end
$do$;
