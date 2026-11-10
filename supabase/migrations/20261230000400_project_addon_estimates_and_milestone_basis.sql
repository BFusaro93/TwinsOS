-- ============================================================
-- Projects: add-on estimates, per-basis percent milestones, exact change-order reversal.
--
-- 1. Converting a SECOND estimate into an existing project used to stamp its milestones onto the
--    project, where a percent milestone resolved against the PROJECT contract: a 50% deposit on
--    a $3,656 add-on billed half of a $60,000 contract. Owner decision (bug sweep r10):
--      * the estimate that seeded the project (projects.source_estimate_id, the first estimate
--        linked to it) keeps billing against the project contract;
--      * an add-on estimate becomes an APPROVED change order on the project (contract up by
--        its pre-tax revenue, EAC up by its all-in cost), recorded on
--        project_change_orders.estimate_id;
--      * the add-on's milestones bill against the add-on estimate's own total.
--    link_estimate_to_project() does the whole step server-side (it replaces three client-side
--    writes in the convert flow), and _milestone_percent_amount_cents() is the one place a
--    percent milestone's amount is resolved (invoicing, change-order freezing).
-- 2. % rounding: the LAST pending percent row of a basis absorbs the rounding remainder, so
--    50/50 of $12,345.67 bills $6,172.84 + $6,172.83 instead of over-billing a cent (which also
--    made the editor read "over by $0.01" and disable Invoice).
-- 3. Change orders: cost_impact_cents is frozen once approved, and the EAC delta approval
--    actually applied (floored at 0) is stored so reverse_change_order() takes back exactly it.
-- ============================================================

-- 1. Columns
alter table public.projects
  add column if not exists source_estimate_id uuid references public.estimates(id) on delete set null;
comment on column public.projects.source_estimate_id is
  'The estimate that seeded this project (the first one converted into it). Its percent milestones bill against the project contract; any other estimate converted into the project is an add-on (an approved change order) whose milestones bill against its own total.';
create index if not exists projects_source_estimate_id_idx on public.projects(source_estimate_id) where source_estimate_id is not null;

alter table public.project_change_orders
  add column if not exists estimate_id uuid references public.estimates(id) on delete set null,
  add column if not exists eac_delta_applied_cents integer;
comment on column public.project_change_orders.estimate_id is
  'Set when this change order is an add-on estimate converted into the project (link_estimate_to_project). System-written only.';
comment on column public.project_change_orders.eac_delta_applied_cents is
  'The EAC change approval actually applied (cost impact, floored so the EAC never goes below 0). reverse_change_order() subtracts exactly this. NULL on change orders approved before 20261230000400.';
create unique index if not exists project_change_orders_one_per_addon_estimate
  on public.project_change_orders(project_id, estimate_id)
  where estimate_id is not null and deleted_at is null;

-- 2. Backfill the seed estimate: the estimate of the earliest live job linked to the project,
--    else the earliest estimate whose milestones were carried onto it. Projects that already have
--    more than one estimate linked keep their contract as is; their extra estimates' percent
--    milestones now bill against those estimates' own totals (see the report for the list).
update public.projects p
   set source_estimate_id = s.estimate_id
  from (
    select distinct on (x.project_id) x.project_id, x.estimate_id
      from (
        select j.project_id, j.estimate_id, j.created_at, 0 as pri
          from public.crm_jobs j
         where j.project_id is not null and j.estimate_id is not null and j.deleted_at is null
        union all
        select m.project_id, m.estimate_id, m.created_at, 1
          from public.estimate_milestones m
         where m.project_id is not null and m.estimate_id is not null and m.deleted_at is null
      ) x
     order by x.project_id, x.pri, x.created_at
  ) s
 where s.project_id = p.id
   and p.source_estimate_id is null;

-- 3. The one resolver for a percent milestone's amount.
create or replace function public._milestone_percent_amount_cents(p_milestone_id uuid)
 returns integer
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_est      uuid;
  v_proj     uuid;
  v_type     text;
  v_value    integer;
  v_seed     uuid;
  v_pretax   boolean := false;
  v_contract integer;
  v_e_total  integer;
  v_e_tax    integer;
  v_group    text;
  v_basis    bigint;
  v_last     uuid;
  v_sum      bigint;
  v_others   bigint;
begin
  select m.estimate_id, m.project_id, m.milestone_type, m.milestone_value
    into v_est, v_proj, v_type, v_value
    from public.estimate_milestones m
   where m.id = p_milestone_id;
  if not found or v_type is distinct from 'percent' then
    return null;
  end if;

  -- Same fallback create_invoice_from_milestone uses for a row not yet stamped with its project.
  if v_proj is null and v_est is not null then
    select j.project_id into v_proj
      from public.crm_jobs j
     where j.estimate_id = v_est and j.project_id is not null and j.deleted_at is null
     limit 1;
  end if;

  if v_proj is not null then
    select p.source_estimate_id, coalesce(p.contract_price_is_pretax, false), p.contract_price
      into v_seed, v_pretax, v_contract
      from public.projects p where p.id = v_proj;
    if v_est is not null and v_seed is not null and v_est <> v_seed then
      v_group := 'addon';
    else
      v_group := 'project';
    end if;
  else
    v_group := 'estimate';
  end if;

  if v_group = 'project' then
    v_basis := v_contract;
  else
    select e.total_cents, e.tax_cents into v_e_total, v_e_tax from public.estimates e where e.id = v_est;
    -- An add-on on a pre-tax project bills its pre-tax share (tax goes on at invoicing), the same
    -- figure its change order added to the contract; otherwise the tax-inclusive total.
    v_basis := case when v_group = 'addon' and v_pretax
                    then coalesce(v_e_total, 0) - coalesce(v_e_tax, 0)
                    else v_e_total end;
  end if;

  if coalesce(v_basis, 0) <= 0 then
    return null;
  end if;

  -- The basis group's percent rows; the last pending one (schedule order) absorbs the remainder.
  with g as (
    select m.id, m.status, m.milestone_value as value, m.sort_order, m.created_at
      from public.estimate_milestones m
     where m.deleted_at is null
       and m.milestone_type = 'percent'
       and (m.id = p_milestone_id
            or case v_group
                 when 'estimate' then m.estimate_id = v_est and m.project_id is null
                 when 'addon'    then m.project_id = v_proj and m.estimate_id = v_est
                 else m.project_id = v_proj
                      and (m.estimate_id is null or v_seed is null or m.estimate_id = v_seed)
               end)
  )
  select (select g2.id from g g2 where g2.status = 'pending'
           order by g2.sort_order desc nulls last, g2.created_at desc, g2.id desc limit 1),
         coalesce(sum(g.value), 0),
         coalesce(sum(round(v_basis::numeric * g.value / 10000)) filter (where g.id <> p_milestone_id), 0)
    into v_last, v_sum, v_others
    from g;

  if v_last is distinct from p_milestone_id or coalesce(v_value, 0) <= 0 then
    return round(v_basis::numeric * coalesce(v_value, 0) / 10000)::integer;
  end if;

  -- The group's rows always add up to exactly round(basis × their total %).
  return greatest(0, round(v_basis::numeric * v_sum / 10000)::bigint - v_others)::integer;
end;
$function$;

revoke all on function public._milestone_percent_amount_cents(uuid) from public, anon, authenticated;

-- 4. Change-order approval: permission-checked wrapper + internal body.
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
         source_estimate_id
    into v_old_contract, v_pretax, v_old_eac, v_seed
    from public.projects where id = v_project_id for update;

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
      where id = (r->>'id')::uuid;

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
    where id = v_target;

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

CREATE OR REPLACE FUNCTION public.approve_change_order(p_change_order_id uuid, p_treatment text DEFAULT NULL::text)
 RETURNS TABLE(change_order_id uuid, new_contract_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- MUST stay first, and must be re-stated by any future `create or replace`
  -- of this function. See 20260913170000 for how this guard gets lost.
  if not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'Not permitted to approve change orders'
      using errcode = 'insufficient_privilege';
  end if;

  return query select t.change_order_id, t.new_contract_cents
    from public._approve_change_order(p_change_order_id, p_treatment) t;
end;
$function$;

revoke all on function public._approve_change_order(uuid, text) from public, anon, authenticated;

-- 5. Reversal: exact EAC delta, add-on guard.
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

  perform 1 from public.projects where id = v_project_id for update;

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

-- 6. Invoicing a milestone: per-basis percent amount.
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
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to invoice a milestone' using errcode = '42501';
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

  if v_project_id is not null then
    declare
      v_proj_deleted timestamptz;
      v_proj_org     uuid;
    begin
      select deleted_at, org_id, client_id, contract_price_is_pretax
        into v_proj_deleted, v_proj_org, v_proj_client, v_pretax
        from public.projects where id = v_project_id;
      if not found or v_proj_deleted is not null then
        raise exception 'Milestone''s project has been deleted';
      end if;
      if v_proj_org is distinct from v_org_id then
        raise exception 'Unauthorized';
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

-- 7. Change-order guard: system-only columns, cost impact frozen once approved.
CREATE OR REPLACE FUNCTION public.fn_project_change_orders_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_via_rpc boolean := coalesce(
    nullif(current_setting('app.change_order_rpc', true), ''), '') = new.id::text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' and not v_via_rpc then
      raise exception 'A change order cannot be created already approved — use approve_change_order()'
        using errcode = 'check_violation';
    end if;
    -- The add-on-estimate link and the applied EAC delta are written only by the RPCs.
    if not v_via_rpc and (new.estimate_id is not null or new.eac_delta_applied_cents is not null) then
      raise exception 'Only converting an estimate into a project can create an add-on change order'
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
  if new.estimate_id is distinct from old.estimate_id
     or new.eac_delta_applied_cents is distinct from old.eac_delta_applied_cents then
    raise exception 'A change order''s add-on estimate and applied cost are set by the system'
      using errcode = 'check_violation';
  end if;
  -- cost_impact_cents is frozen too: approval moved the EAC by it, and reversal takes back the
  -- recorded delta — editing it in between made the two disagree.
  if old.status = 'approved'
     and (new.amount_cents is distinct from old.amount_cents
          or new.billing_treatment is distinct from old.billing_treatment
          or new.cost_impact_cents is distinct from old.cost_impact_cents) then
    raise exception 'An approved change order''s amount is fixed — reverse it and raise a new one'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- 8. Converting an estimate into a project: seed or add-on, server-side and atomic.
--    Replaces the convert flow's three client writes (seed contract, seed EAC, stamp milestones).
create or replace function public.link_estimate_to_project(p_project_id uuid, p_estimate_id uuid)
 returns table(kind text, change_order_id uuid, co_number integer, amount_cents integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_org        uuid;
  v_deleted    timestamptz;
  v_seed       uuid;
  v_e_org      uuid;
  v_e_deleted  timestamptz;
  v_e_number   integer;
  v_e_desc     text;
  v_revenue    integer;
  v_eac        integer;
  v_kind       text;
  v_co_id      uuid;
  v_co_number  integer;
  v_has_ms     boolean;
begin
  -- Same rights that let the convert flow stamp the estimate's milestones onto the project
  -- (enforce_estimate_milestone_write_permission): converting the job, or editing projects.
  if not public._crm_has_any_permission(array['job_add', 'sched_add_modify_projects']) then
    raise exception 'You do not have permission to link an estimate to a project' using errcode = '42501';
  end if;

  select p.org_id, p.deleted_at, p.source_estimate_id
    into v_org, v_deleted, v_seed
    from public.projects p where p.id = p_project_id
    for update;
  if not found or v_deleted is not null then
    raise exception 'Project not found';
  end if;
  if public._org_mismatch(v_org) then
    raise exception 'Unauthorized';
  end if;

  select e.org_id, e.deleted_at, e.estimate_number, coalesce(e.description, ''),
         case
           when coalesce(e.revenue_cents, 0) > 0 then e.revenue_cents
           when e.subtotal_cents is not null then greatest(0, e.subtotal_cents - coalesce(e.discount_cents, 0))
           else greatest(0, coalesce(e.total_cents, 0) - coalesce(e.tax_cents, 0))
         end,
         -- The estimate's all-in cost (revenue − net profit: direct cost + overhead), the figure
         -- the convert dialog always seeded the EAC with.
         case when coalesce(e.revenue_cents, 0) > 0 and e.net_profit_cents is not null
              then greatest(0, e.revenue_cents - e.net_profit_cents) else 0 end
    into v_e_org, v_e_deleted, v_e_number, v_e_desc, v_revenue, v_eac
    from public.estimates e where e.id = p_estimate_id;
  if not found or v_e_deleted is not null then
    raise exception 'Estimate not found';
  end if;
  if v_e_org is distinct from v_org then
    raise exception 'Unauthorized';
  end if;
  -- Only a real conversion links an estimate: a job from this estimate on this project.
  if not exists (
    select 1 from public.crm_jobs j
     where j.estimate_id = p_estimate_id and j.project_id = p_project_id and j.deleted_at is null
  ) then
    raise exception 'Convert the estimate into a job on this project first';
  end if;

  -- The seed is the first estimate ever linked to the project.
  if v_seed is null then
    select x.estimate_id into v_seed
      from (
        select j.estimate_id, j.created_at, 0 as pri
          from public.crm_jobs j
         where j.project_id = p_project_id and j.estimate_id is not null and j.deleted_at is null
        union all
        select m.estimate_id, m.created_at, 1
          from public.estimate_milestones m
         where m.project_id = p_project_id and m.estimate_id is not null and m.deleted_at is null
      ) x
     order by x.pri, x.created_at
     limit 1;
    v_seed := coalesce(v_seed, p_estimate_id);
    update public.projects set source_estimate_id = v_seed where id = p_project_id;
  end if;

  if v_seed = p_estimate_id then
    -- The seeding estimate: fill the contract (PRE-tax) and EAC only while unset, so a PM's
    -- figures are never clobbered — what the convert flow always did.
    update public.projects
       set original_contract_price = v_revenue
     where id = p_project_id and original_contract_price = 0 and v_revenue > 0;
    update public.projects
       set estimated_cost_cents = v_eac
     where id = p_project_id and coalesce(estimated_cost_cents, 0) = 0 and v_eac > 0;
    v_kind := 'seed';
  else
    select co.id, co.co_number into v_co_id, v_co_number
      from public.project_change_orders co
     where co.project_id = p_project_id and co.estimate_id = p_estimate_id and co.deleted_at is null
     limit 1;
    if v_co_id is not null then
      -- A later conversion pass of the same add-on estimate: already on the contract.
      v_kind := 'addon_existing';
    elsif v_revenue > 0 or v_eac > 0 then
      -- The add-on's own milestones carry its billing ('none'); with none, the change order
      -- gets a milestone of its own like any other.
      select exists (
        select 1 from public.estimate_milestones m
         where m.estimate_id = p_estimate_id and m.deleted_at is null
      ) into v_has_ms;
      v_co_id := gen_random_uuid();
      perform set_config('app.change_order_rpc', v_co_id::text, true);
      insert into public.project_change_orders (
        id, org_id, project_id, title, description, amount_cents, cost_impact_cents,
        billing_treatment, status, estimate_id, created_by
      ) values (
        v_co_id, v_org, p_project_id,
        left(trim(format('Add-on: Estimate #%s%s', coalesce(v_e_number::text, '?'),
                         case when v_e_desc <> '' then ' - ' || v_e_desc else '' end)), 200),
        'Added automatically when this estimate was converted into the project. Its milestones bill against the estimate''s own total.',
        v_revenue, v_eac,
        case when v_has_ms then 'none' else 'own_milestone' end,
        'pending_approval', p_estimate_id, auth.uid()
      );
      perform 1 from public._approve_change_order(v_co_id, null);
      select co.co_number into v_co_number from public.project_change_orders co where co.id = v_co_id;
      v_kind := 'addon';
    else
      v_kind := 'addon_existing';
    end if;
  end if;

  -- Carry the estimate's untouched milestones onto the project (same rows, not copies). After
  -- the approval above, so an add-on's percent rows are never frozen at the old contract.
  update public.estimate_milestones m
     set project_id = p_project_id
   where m.estimate_id = p_estimate_id
     and m.project_id is null
     and m.deleted_at is null;

  return query select v_kind, v_co_id, v_co_number, case when v_kind = 'addon' then v_revenue else null end;
end;
$function$;

revoke all on function public.link_estimate_to_project(uuid, uuid) from public, anon;
grant execute on function public.link_estimate_to_project(uuid, uuid) to authenticated, service_role;
