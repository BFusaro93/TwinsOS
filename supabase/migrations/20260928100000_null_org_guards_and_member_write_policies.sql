-- 9/28 security sweep.
--
-- 1. 18 SECURITY DEFINER RPCs guarded with `if <org> != my_org_id() then raise`.
--    For a caller with no profiles row (portal customers — and, since
--    20260926150000, any bare public signUp()), my_org_id() is NULL, the
--    comparison is NULL and the guard never fires: a portal customer could
--    call apply_payment_to_invoice / increment_invoice_totals on their own
--    invoice, and the p_org_id variants accepted any org. Every guard now goes
--    through _org_mismatch(), which fails CLOSED for a NULL org and only
--    exempts the service role (webhooks/crons) and JWT-less in-database calls.
--    Function bodies below are the live PROD definitions with only that guard
--    changed — edit future versions from pg_get_functiondef, not old files.
--
-- 2. Tables writable by ANY org member through PostgREST even though the app
--    only writes them from admin-gated routes: api_keys (any member could mint
--    a full-scope v1/MCP key), zapier_webhook_subscriptions (exfiltrate every
--    event to an attacker URL), integrations (QuickBooks tokens readable),
--    client_portal_users / client_portal_invites (link yourself to ANY client
--    incl. another org's; read invite tokens), client_portal_settings,
--    crm_payment_allocations (crew could rewrite/delete allocations),
--    pm_schedule_pauses (other org's schedule id).
--
-- 3. Forms: anon could insert crm_form_responses directly (skipping Turnstile
--    and validation — the public submit route uses the service role); the
--    form-attachments INSERT policy compared crm_forms.name instead of the
--    object path (uploads never worked); its SELECT policy let anyone list and
--    download every published form's uploads.

create or replace function public._org_mismatch(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when auth.role() = 'service_role' then false
    when auth.role() is null and auth.uid() is null then false  -- in-database (cron/trigger) call, no JWT
    else p_org is distinct from public.my_org_id()
  end;
$$;
revoke all on function public._org_mismatch(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.adjust_part_quantity_manual(p_part_id uuid, p_new_qty integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id     uuid;
  v_user_name   text;
  v_org_id      uuid;
  v_old_qty     integer;
  v_part_name   text;
  v_unit_cost   numeric;
  v_cost_layers jsonb;
  v_delta       integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for manual quantity adjustments';
  end if;

  if p_new_qty is null or p_new_qty < 0 then
    raise exception 'Quantity on hand cannot be negative';
  end if;

  select quantity_on_hand, name, org_id, unit_cost, cost_layers
    into v_old_qty, v_part_name, v_org_id, v_unit_cost, v_cost_layers
    from public.parts
   where id = p_part_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Part not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_new_qty = v_old_qty then
    return;
  end if;

  v_delta := p_new_qty - v_old_qty;
  if v_delta > 0 then
    v_cost_layers := public.append_cost_layer(v_cost_layers, v_delta, v_unit_cost);
  else
    v_cost_layers := public.decrement_cost_layers(v_cost_layers, abs(v_delta));
  end if;

  select coalesce(name, email, id::text) into v_user_name
    from public.profiles
   where id = v_user_id
   limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
     set quantity_on_hand = p_new_qty,
         cost_layers      = v_cost_layers,
         updated_at       = now()
   where id = p_part_id;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
    v_user_name,
    v_part_name || ': quantity adjusted — ' || trim(p_reason),
    'quantity_on_hand', v_old_qty::text, p_new_qty::text
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_part_quantity(p_part_id uuid, p_delta integer, p_work_order_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(old_qty integer, new_qty integer, applied_delta integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id      uuid;
  v_user_name    text;
  v_org_id       uuid;
  v_old_qty      integer;
  v_new_qty      integer;
  v_part_name    text;
  v_wo_number    text;
  v_description  text;
  v_unit_cost    numeric;
  v_cost_layers  jsonb;
  v_applied      integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select name into v_user_name
    from public.profiles
    where id = v_user_id
    limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  select quantity_on_hand, name, org_id, unit_cost, cost_layers
    into v_old_qty, v_part_name, v_org_id, v_unit_cost, v_cost_layers
    from public.parts
    where id = p_part_id and deleted_at is null
    for update;
  if not found then
    return;
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  v_new_qty := greatest(0, v_old_qty + p_delta);
  if v_new_qty = v_old_qty then
    old_qty := v_old_qty;
    new_qty := v_new_qty;
    applied_delta := 0;
    return next;
    return;
  end if;

  v_applied := v_new_qty - v_old_qty;

  if v_applied < 0 then
    v_cost_layers := public.decrement_cost_layers(v_cost_layers, abs(v_applied));
  else
    v_cost_layers := public.append_cost_layer(v_cost_layers, v_applied, v_unit_cost);
  end if;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
  set quantity_on_hand = v_new_qty,
      cost_layers = v_cost_layers,
      updated_at = now()
  where id = p_part_id;

  if p_work_order_id is not null then
    select work_order_number into v_wo_number
      from public.work_orders
      where id = p_work_order_id;
  end if;

  v_description := v_part_name || ': ' ||
    case
      when v_wo_number is not null and p_delta < 0 then 'used ' || abs(p_delta) || ' on ' || v_wo_number
      when v_wo_number is not null and p_delta > 0 then 'returned ' || p_delta || ' from ' || v_wo_number
      else 'quantity adjusted'
    end;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
    v_user_name, v_description,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );

  old_qty := v_old_qty;
  new_qty := v_new_qty;
  applied_delta := v_applied;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_part_quantity(p_org_id uuid, p_part_id uuid, p_delta integer, p_po_number text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_user_name text;
  v_old_qty   integer;
  v_new_qty   integer;
  v_part_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL OR public._org_mismatch(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_delta = 0 THEN
    RETURN;
  END IF;

  SELECT name INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id
    LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  SELECT quantity_on_hand, name INTO v_old_qty, v_part_name
    FROM public.parts
    WHERE id = p_part_id AND org_id = p_org_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part not found';
  END IF;
  v_new_qty := v_old_qty + p_delta;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Adjustment would make % quantity on hand negative (% + % = %)', v_part_name, v_old_qty, p_delta, v_new_qty;
  END IF;

  PERFORM set_config('app.suppress_parts_qty_audit', 'true', true);

  UPDATE public.parts
  SET quantity_on_hand = v_new_qty
  WHERE id = p_part_id AND org_id = p_org_id;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    p_org_id, v_user_id, 'part', p_part_id, 'received',
    v_user_name,
    v_part_name || ': receipt correction ' || (CASE WHEN p_delta > 0 THEN '+' ELSE '' END) || p_delta
      || ' via PO ' || COALESCE(NULLIF(p_po_number, ''), '(unknown)'),
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_product_item_quantity(p_org_id uuid, p_product_id uuid, p_delta numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id      uuid;
  v_user_name    text;
  v_old_qty      numeric;
  v_new_qty      numeric;
  v_product_name text;
  v_unit_cost    numeric;
  v_cost_layers  jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null or public._org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_delta = 0 then
    return;
  end if;

  select name into v_user_name
    from public.profiles
    where id = v_user_id
    limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  select quantity_on_hand, name, unit_cost, cost_layers
    into v_old_qty, v_product_name, v_unit_cost, v_cost_layers
    from public.product_items
    where id = p_product_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Product not found';
  end if;
  v_new_qty := v_old_qty + p_delta;

  if v_new_qty < 0 then
    raise exception 'Adjustment would make % quantity on hand negative (% + % = %)', v_product_name, v_old_qty, p_delta, v_new_qty;
  end if;

  if p_delta < 0 then
    v_cost_layers := public.decrement_cost_layers(v_cost_layers, abs(p_delta));
  else
    v_cost_layers := public.append_cost_layer(v_cost_layers, p_delta, v_unit_cost);
  end if;

  update public.product_items
  set quantity_on_hand = v_new_qty,
      cost_layers = v_cost_layers
  where id = p_product_id and org_id = p_org_id;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    -- 'product', not 'product_item': ProductDetailSheet reads 'product', and
    -- the trigger on product_items has always written 'product' too.
    p_org_id, v_user_id, 'product', p_product_id, 'qty_adjusted',
    v_user_name,
    v_product_name || ': ' || coalesce(p_reason, 'quantity adjustment') || ' '
      || (case when p_delta > 0 then '+' else '' end) || p_delta,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice(p_invoice_id uuid, p_delta_cents integer)
 RETURNS TABLE(new_status text, was_newly_paid boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id      uuid;
  v_total_cents integer;
  v_old_paid    integer;
  v_old_status  text;
  v_new_paid    integer;
  v_new_balance integer;
  v_open_status text;
  v_new_status  text;
  v_number      integer;
begin
  select org_id, total_cents, amount_paid_cents, status, invoice_number
    into v_org_id, v_total_cents, v_old_paid, v_old_status, v_number
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  v_new_paid := greatest(0, v_old_paid + p_delta_cents);
  v_new_balance := greatest(0, v_total_cents - v_new_paid);
  v_open_status := case when v_old_status = 'printed' then 'printed' else 'sent' end;
  v_new_status := case
    when v_new_balance <= 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    else v_open_status
  end;

  update public.crm_invoices
  set amount_paid_cents = v_new_paid,
      balance_cents = v_new_balance,
      status = v_new_status
  where id = p_invoice_id;

  if v_number is null then
    perform public.assign_invoice_number(p_invoice_id);
  end if;

  return query select v_new_status, (v_new_status = 'paid' and v_old_status is distinct from 'paid');
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_change_order(p_change_order_id uuid, p_treatment text DEFAULT NULL::text)
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
  if public._org_mismatch(v_org_id) then
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

CREATE OR REPLACE FUNCTION public.correct_part_receipt(p_org_id uuid, p_part_id uuid, p_delta integer, p_unit_cost integer, p_po_number text)
 RETURNS TABLE(old_qty integer, new_qty integer, requested_delta integer, applied_delta integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_user_id     uuid := auth.uid();
  v_user_name   text;
  v_old_qty     integer;
  v_new_qty     integer;
  v_old_cost    integer;
  v_new_cost    integer;
  v_part_name   text;
  v_product_id  uuid;
  v_layers      jsonb[];
  v_result      jsonb;
  v_take        integer;
  v_remaining   integer;
  v_layer_qty   numeric;
  v_step        numeric;
  v_cost_method text;
  v_total_qty   numeric;
  v_total_value numeric;
  v_applied     integer;
  i             int;
begin
  if v_user_id is null or public._org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  select quantity_on_hand, unit_cost, name, product_item_id,
         array(select jsonb_array_elements(coalesce(cost_layers, '[]'::jsonb)))
    into v_old_qty, v_old_cost, v_part_name, v_product_id, v_layers
    from public.parts
    where id = p_part_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Part not found';
  end if;

  if coalesce(p_delta, 0) = 0 then
    old_qty := v_old_qty; new_qty := v_old_qty; requested_delta := 0; applied_delta := 0;
    return next;
    return;
  end if;

  if p_delta > 0 then
    v_applied := p_delta;
    v_layers := v_layers || jsonb_build_object(
      'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
      'quantity', p_delta,
      'unitCost', coalesce(p_unit_cost, v_old_cost),
      'receivedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'poNumber', p_po_number
    );
  else
    v_take := least(-p_delta, greatest(v_old_qty, 0));
    v_applied := -v_take;
    v_remaining := v_take;

    if coalesce(p_po_number, '') <> '' and v_remaining > 0 then
      for i in reverse coalesce(array_length(v_layers, 1), 0) .. 1 loop
        exit when v_remaining <= 0;
        if v_layers[i]->>'poNumber' = p_po_number then
          v_layer_qty := coalesce((v_layers[i]->>'quantity')::numeric, 0);
          if v_layer_qty > 0 then
            v_step := least(v_layer_qty, v_remaining);
            v_layers[i] := jsonb_set(v_layers[i], '{quantity}', to_jsonb(v_layer_qty - v_step));
            v_remaining := v_remaining - v_step;
          end if;
        end if;
      end loop;
    end if;

    select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_result
      from unnest(v_layers) with ordinality as u(e, o);

    if v_remaining > 0 then
      v_result := public.decrement_cost_layers(v_result, v_remaining);
    end if;
    v_layers := array(select jsonb_array_elements(v_result));
  end if;

  select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_result
    from unnest(v_layers) with ordinality as u(e, o);

  v_new_qty := v_old_qty + v_applied;

  select cost_method into v_cost_method from public.organizations where id = p_org_id;
  v_new_cost := v_old_cost;
  if v_cost_method = 'wac' then
    select coalesce(sum((l->>'quantity')::numeric), 0),
           coalesce(sum((l->>'quantity')::numeric * (l->>'unitCost')::numeric), 0)
      into v_total_qty, v_total_value
      from jsonb_array_elements(v_result) l
      where (l->>'quantity')::numeric > 0;
    if v_total_qty > 0 then
      v_new_cost := round(v_total_value / v_total_qty);
    end if;
  end if;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
    set quantity_on_hand = v_new_qty,
        cost_layers      = v_result,
        unit_cost        = v_new_cost,
        updated_at       = now()
    where id = p_part_id and org_id = p_org_id;

  if v_product_id is not null and v_new_cost is distinct from v_old_cost then
    update public.product_items set unit_cost = v_new_cost
      where id = v_product_id and org_id = p_org_id;
  end if;

  if v_applied <> 0 then
    select name into v_user_name from public.profiles where id = v_user_id limit 1;
    insert into public.audit_log (
      org_id, created_by, record_type, record_id, action,
      changed_by_name, description, field_changed, old_value, new_value
    ) values (
      p_org_id, v_user_id, 'part', p_part_id, 'received',
      coalesce(v_user_name, 'System'),
      v_part_name || ': receipt correction ' || (case when v_applied > 0 then '+' else '' end) || v_applied
        || ' via PO ' || coalesce(nullif(p_po_number, ''), '(unknown)')
        || case when v_applied <> p_delta
             then ' (requested ' || p_delta || '; only ' || v_old_qty || ' on hand)'
             else '' end,
      'quantity_on_hand', v_old_qty::text, v_new_qty::text
    );
  end if;

  old_qty := v_old_qty;
  new_qty := v_new_qty;
  requested_delta := p_delta;
  applied_delta := v_applied;
  return next;
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
begin
  select org_id, estimate_id, project_id, name, amount_cents, status, milestone_type, milestone_value
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status, v_type, v_value
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  -- A milestone invoiced from the estimate side still belongs to the project
  -- that estimate became, so the project's Billing tab and the WIP report see
  -- it without the user having to bill from the project specifically.
  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  -- Re-resolve a percentage against whatever the contract says right now.
  if v_type = 'percent' then
    if v_project_id is not null then
      select contract_price into v_basis from public.projects where id = v_project_id;
    else
      select total_cents into v_basis from public.estimates where id = v_estimate_id;
    end if;

    -- A zero/absent basis would silently bill $0. Keep the last known good
    -- snapshot instead, so a half-configured project can't erase an invoice.
    if coalesce(v_basis, 0) > 0 then
      v_amount := round(v_basis::numeric * v_value / 10000);
    end if;
  end if;

  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Milestone amount must be greater than zero';
  end if;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, po_number, subtotal_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), p_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    public.org_today(v_org_id),
    p_po_number, v_amount, v_amount, v_amount, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_amount, v_amount, 0
  );

  -- Write the resolved figure back so the schedule, the sums on it, and the
  -- invoice all report the same number afterwards.
  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_append_visit_job_comment(p_visit_id uuid, p_comment_id text, p_author_name text, p_author_id uuid, p_text text, p_created_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id   uuid;
  v_existing jsonb;
  v_next     jsonb;
begin
  if p_comment_id is null or btrim(p_comment_id) = '' then
    raise exception 'crm_append_visit_job_comment: p_comment_id is required';
  end if;

  select org_id, job_comments
    into v_org_id, v_existing
    from public.crm_job_visits
   where id = p_visit_id and deleted_at is null
   for update;

  if not found then
    raise exception 'Visit not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  v_existing := case jsonb_typeof(v_existing)
    when 'array'  then v_existing
    when 'string' then jsonb_build_array(jsonb_build_object(
                         'id',         'crew-note',
                         'authorName', 'Crew',
                         'authorId',   '',
                         'text',       v_existing #>> '{}',
                         'createdAt',  p_created_at
                       ))
    else '[]'::jsonb
  end;

  if exists (
    select 1 from jsonb_array_elements(v_existing) e
     where e ->> 'id' = p_comment_id
  ) then
    return v_existing;
  end if;

  v_next := v_existing || jsonb_build_array(jsonb_build_object(
    'id',         p_comment_id,
    'authorName', p_author_name,
    'authorId',   coalesce(p_author_id::text, ''),
    'text',       p_text,
    'createdAt',  p_created_at
  ));

  update public.crm_job_visits
     set job_comments = v_next,
         updated_at   = p_created_at
   where id = p_visit_id;

  return v_next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_job_product(p_job_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id     uuid;
  v_product_id uuid;
  v_status     text;
  v_restore    numeric;
BEGIN
  SELECT org_id, product_id, status, inventory_adjusted_qty
    INTO v_org_id, v_product_id, v_status, v_restore
    FROM public.crm_job_products
    WHERE id = p_job_product_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job product not found';
  END IF;

  IF public._org_mismatch(v_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status IN ('invoiced', 'used_no_invoice')
     AND v_restore IS NOT NULL AND v_restore != 0
     AND v_product_id IS NOT NULL THEN
    PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, v_restore, 'job product deleted');
  END IF;

  UPDATE public.crm_job_products
  SET deleted_at = now(), inventory_adjusted_qty = NULL
  WHERE id = p_job_product_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_invoice_totals(p_invoice_id uuid, p_delta_cents integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id         uuid;
  v_subtotal       integer;
  v_discount       integer;
  v_tax_rate_bps   integer;
  v_amount_paid    integer;
  v_taxable_net    integer;
  v_tax_cents      integer;
  v_total_cents    integer;
begin
  if p_delta_cents = 0 then
    return;
  end if;

  select org_id, subtotal_cents, coalesce(discount_cents, 0), coalesce(tax_rate_bps, 0), coalesce(amount_paid_cents, 0)
    into v_org_id, v_subtotal, v_discount, v_tax_rate_bps, v_amount_paid
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  v_subtotal := v_subtotal + p_delta_cents;

  select coalesce(sum(li.total_cents - coalesce(li.discount_cents, 0)), 0)
    into v_taxable_net
    from public.crm_invoice_line_items li
    where li.invoice_id = p_invoice_id
      and li.is_taxable = true;

  v_tax_cents := round((greatest(0, v_taxable_net - v_discount)::numeric * v_tax_rate_bps) / 10000)::integer;
  v_total_cents := v_subtotal - v_discount + v_tax_cents;

  update public.crm_invoices
  set subtotal_cents = v_subtotal,
      tax_cents      = v_tax_cents,
      total_cents    = v_total_cents,
      balance_cents  = greatest(0, v_total_cents - v_amount_paid),
      updated_at     = now()
  where id = p_invoice_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.insert_audit_entry(p_org_id text, p_record_type text, p_record_id text, p_action text, p_description text, p_field_changed text DEFAULT NULL::text, p_old_value text DEFAULT NULL::text, p_new_value text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_user_name text;
BEGIN
  v_user_id := auth.uid();

  -- Verify caller belongs to the org
  IF v_user_id IS NULL OR public._org_mismatch(p_org_id::uuid)::uuid THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT name INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id
    LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    p_org_id::uuid, v_user_id, p_record_type, p_record_id::uuid, p_action,
    v_user_name, p_description, p_field_changed, p_old_value, p_new_value
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.receive_part_quantity(p_org_id uuid, p_part_id uuid, p_quantity integer, p_layer_unit_cost integer, p_received_at text, p_po_number text, p_cost_method text, p_po_line_item_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id     uuid;
  v_user_name   text;
  v_old_qty     integer;
  v_new_qty     integer;
  v_old_cost    integer;
  v_part_name   text;
  v_description text;
  v_product_item_id uuid;
  v_current_layers  jsonb;
  v_new_layer       jsonb;
  v_new_layers      jsonb;
  v_total_qty       numeric;
  v_total_value     numeric;
  v_new_unit_cost   integer;
  v_line_ordered    numeric;
  v_line_received   numeric;
begin
  v_user_id := auth.uid();

  if v_user_id is null or public._org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_quantity <= 0 then
    raise exception 'Received quantity must be positive';
  end if;

  select name into v_user_name
    from public.profiles
    where id = v_user_id
    limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  if p_po_line_item_id is not null then
    select quantity into v_line_ordered
      from public.po_line_items
      where id = p_po_line_item_id and org_id = p_org_id
      for update;
    if found then
      select coalesce(sum(quantity_received), 0) into v_line_received
        from public.goods_receipt_lines
        where po_line_item_id = p_po_line_item_id;
      if v_line_received > v_line_ordered then
        raise exception 'Cannot receive % more of this line — % already recorded against % ordered. Reduce the quantity or check for a duplicate submission.',
          p_quantity, v_line_received, v_line_ordered;
      end if;
    end if;
  end if;

  select quantity_on_hand, unit_cost, name, product_item_id, coalesce(cost_layers, '[]'::jsonb)
    into v_old_qty, v_old_cost, v_part_name, v_product_item_id, v_current_layers
    from public.parts
    where id = p_part_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Part not found';
  end if;
  v_new_qty := v_old_qty + p_quantity;

  v_new_layer := jsonb_build_object(
    'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
    'quantity', p_quantity,
    'unitCost', p_layer_unit_cost,
    'receivedAt', p_received_at,
    'poNumber', p_po_number
  );
  v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);

  if p_cost_method = 'wac' then
    select coalesce(sum((l->>'quantity')::numeric), 0), coalesce(sum((l->>'quantity')::numeric * (l->>'unitCost')::numeric), 0)
      into v_total_qty, v_total_value
      from jsonb_array_elements(v_new_layers) l
      where (l->>'quantity')::numeric > 0;
    v_new_unit_cost := case when v_total_qty > 0 then round(v_total_value / v_total_qty) else v_old_cost end;
  else
    v_new_unit_cost := round(p_layer_unit_cost);
  end if;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
  set quantity_on_hand = v_new_qty,
      unit_cost         = v_new_unit_cost,
      cost_layers       = v_new_layers
  where id = p_part_id and org_id = p_org_id;

  if v_product_item_id is not null then
    update public.product_items
    set unit_cost = v_new_unit_cost
    where id = v_product_item_id and org_id = p_org_id;
  end if;

  v_description := v_part_name || ': received ' || p_quantity || ' via PO ' ||
    coalesce(nullif(p_po_number, ''), '(unknown)');
  if v_new_unit_cost is distinct from v_old_cost then
    v_description := v_description || ' (unit cost $' ||
      round(v_old_cost::numeric / 100, 2) || ' → $' || round(v_new_unit_cost::numeric / 100, 2) || ')';
  end if;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    p_org_id, v_user_id, 'part', p_part_id, 'received',
    v_user_name, v_description,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.receive_product_cost_layer(p_org_id uuid, p_product_id uuid, p_layer_quantity numeric, p_layer_unit_cost integer, p_received_at text, p_po_number text, p_cost_method text, p_po_line_item_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(new_unit_cost integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_layers    jsonb;
  v_current_unit_cost integer;
  v_new_layer         jsonb;
  v_new_layers        jsonb;
  v_total_qty         numeric;
  v_total_value       numeric;
  v_new_unit_cost     integer;
  v_line_ordered      numeric;
  v_line_received     numeric;
begin
  if public._org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_po_line_item_id is not null then
    select quantity into v_line_ordered
      from public.po_line_items
      where id = p_po_line_item_id and org_id = p_org_id
      for update;
    if found then
      select coalesce(sum(quantity_received), 0) into v_line_received
        from public.goods_receipt_lines
        where po_line_item_id = p_po_line_item_id;
      if v_line_received > v_line_ordered then
        raise exception 'Cannot receive % more of this line — % already recorded against % ordered. Reduce the quantity or check for a duplicate submission.',
          p_layer_quantity, v_line_received, v_line_ordered;
      end if;
    end if;
  end if;

  select coalesce(cost_layers, '[]'::jsonb), unit_cost
    into v_current_layers, v_current_unit_cost
    from public.product_items
    where id = p_product_id and org_id = p_org_id
    for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_new_layer := jsonb_build_object(
    'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
    'quantity', p_layer_quantity,
    'unitCost', p_layer_unit_cost,
    'receivedAt', p_received_at,
    'poNumber', p_po_number
  );
  v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);

  if p_cost_method = 'wac' then
    select coalesce(sum((l->>'quantity')::numeric), 0), coalesce(sum((l->>'quantity')::numeric * (l->>'unitCost')::numeric), 0)
      into v_total_qty, v_total_value
      from jsonb_array_elements(v_new_layers) l
      where (l->>'quantity')::numeric > 0;
    v_new_unit_cost := case when v_total_qty > 0 then round(v_total_value / v_total_qty) else v_current_unit_cost end;
  else
    v_new_unit_cost := round(p_layer_unit_cost);
  end if;

  update public.product_items
  set cost_layers = v_new_layers,
      unit_cost = v_new_unit_cost
  where id = p_product_id and org_id = p_org_id;

  return query select v_new_unit_cost;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refund_payment(p_payment_id uuid, p_refund_amount_cents integer)
 RETURNS TABLE(new_refunded_amount_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id           uuid;
  v_amount_cents     integer;
  v_old_refunded     integer;
  v_unused           integer;
  v_invoice_id       uuid;
  v_new_refunded     integer;
  v_from_unused      integer;
  v_to_allocations   integer;
  v_total_allocated  integer;
  v_remaining        integer;
  v_share            integer;
  v_alloc            record;
  v_idx              integer := 0;
  v_count            integer;
begin
  select org_id, amount_cents, refunded_amount_cents,
         coalesce(unused_amount_cents, 0), invoice_id
    into v_org_id, v_amount_cents, v_old_refunded, v_unused, v_invoice_id
    from public.crm_payments
    where id = p_payment_id
    for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_refund_amount_cents <= 0 then
    raise exception 'Refund amount must be positive';
  end if;

  v_new_refunded := v_old_refunded + p_refund_amount_cents;

  if v_new_refunded > v_amount_cents then
    raise exception 'Refund amount exceeds remaining refundable balance';
  end if;

  v_from_unused    := least(p_refund_amount_cents, v_unused);
  v_to_allocations := p_refund_amount_cents - v_from_unused;

  update public.crm_payments
  set refunded_amount_cents = v_new_refunded,
      unused_amount_cents   = v_unused - v_from_unused
  where id = p_payment_id;

  if v_to_allocations > 0 then
    select coalesce(sum(amount_cents), 0), count(*)
      into v_total_allocated, v_count
      from public.crm_payment_allocations
      where payment_id = p_payment_id;

    if v_count > 0 then
      v_remaining := v_to_allocations;

      for v_alloc in
        select id, invoice_id, amount_cents
          from public.crm_payment_allocations
          where payment_id = p_payment_id
          order by created_at, id
          for update
      loop
        v_idx := v_idx + 1;

        if v_idx = v_count then
          v_share := v_remaining;
        else
          v_share := round((v_to_allocations::numeric * v_alloc.amount_cents) / v_total_allocated);
        end if;

        v_share := least(v_share, v_alloc.amount_cents, v_remaining);

        if v_share > 0 then
          v_remaining := v_remaining - v_share;

          if v_share >= v_alloc.amount_cents then
            delete from public.crm_payment_allocations where id = v_alloc.id;
          else
            update public.crm_payment_allocations
            set amount_cents = amount_cents - v_share
            where id = v_alloc.id;
          end if;

          perform public.apply_payment_to_invoice(v_alloc.invoice_id, -v_share);
        end if;
      end loop;
    elsif v_invoice_id is not null then
      perform public.apply_payment_to_invoice(v_invoice_id, -v_to_allocations);
    end if;
  end if;

  return query select v_new_refunded;
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

  perform public.fn_recalc_project_contract_price(v_project_id);
  select contract_price into v_new_contract from public.projects where id = v_project_id;

  return query select p_change_order_id, v_new_contract;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_job_product_status(p_job_product_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id       uuid;
  v_job_id       uuid;
  v_product_id   uuid;
  v_qty          numeric;
  v_old_status   text;
  v_restore      numeric;
  v_is_inventory boolean;
  v_old_used     boolean;
  v_new_used     boolean;
BEGIN
  IF p_new_status NOT IN ('pending', 'used', 'invoiced', 'used_no_invoice', 'not_used') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT org_id, job_id, product_id, qty, status, inventory_adjusted_qty
    INTO v_org_id, v_job_id, v_product_id, v_qty, v_old_status, v_restore
    FROM public.crm_job_products
    WHERE id = p_job_product_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job product not found';
  END IF;

  -- Unchanged from the original: a NULL my_org_id() (service role, which has no
  -- profile row) deliberately passes, because server-side flows such as goods
  -- receiving call this without an end-user session.
  IF public._org_mismatch(v_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Crew accounts: only their own crew's jobs. crm_job_products was missed by
  -- 20260910160000_crew_write_lockdown.sql and this function is SECURITY
  -- DEFINER, so without this a crew JWT could resolve materials on any job in
  -- the org. visit.crew_id is frequently NULL, so the job's crew is the
  -- fallback (the app calls this the effective crew).
  IF coalesce(public.my_role(), '') = 'crew' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.crm_job_visits v
      JOIN public.crm_jobs j ON j.id = v.job_id
      WHERE v.job_id = v_job_id
        AND v.deleted_at IS NULL
        AND coalesce(v.crew_id, j.crew_id) IN (SELECT public.my_crew_ids())
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  -- 'used' means used-and-still-to-be-invoiced. It counts as a used state for
  -- inventory, so pending -> used decrements exactly once and used -> invoiced
  -- moves between two used states and does nothing.
  v_old_used := v_old_status IN ('used', 'invoiced', 'used_no_invoice');
  v_new_used := p_new_status IN ('used', 'invoiced', 'used_no_invoice');

  IF v_product_id IS NOT NULL THEN
    SELECT is_inventory INTO v_is_inventory FROM public.product_items WHERE id = v_product_id;
  END IF;

  IF NOT v_old_used AND v_new_used AND COALESCE(v_is_inventory, false) THEN
    PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, -v_qty, 'used on job');
    UPDATE public.crm_job_products
    SET status = p_new_status, inventory_adjusted_qty = v_qty
    WHERE id = p_job_product_id;
  ELSIF v_old_used AND NOT v_new_used THEN
    IF v_restore IS NOT NULL AND v_restore != 0 AND v_product_id IS NOT NULL THEN
      PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, v_restore, 'job product reopened or cancelled');
    END IF;
    UPDATE public.crm_job_products
    SET status = p_new_status, inventory_adjusted_qty = NULL
    WHERE id = p_job_product_id;
  ELSE
    UPDATE public.crm_job_products
    SET status = p_new_status
    WHERE id = p_job_product_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_wo_part_stock(p_wo_part_id uuid, p_target integer)
 RETURNS TABLE(old_qty integer, new_qty integer, requested_delta integer, applied_delta integer, quantity_deducted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if public._org_mismatch(v_row.org_id) then
    raise exception 'Unauthorized';
  end if;

  v_deducted := coalesce(
    v_row.quantity_deducted,
    case when v_row.deleted_at is null then v_row.quantity else 0 end
  );

  if v_row.part_id is null then
    old_qty := null; new_qty := null;
    requested_delta := 0; applied_delta := 0;
    quantity_deducted := 0;
    return next;
    return;
  end if;

  v_req := v_deducted - v_target;

  if v_req <> 0 then
    select * into v_res
      from public.adjust_part_quantity(v_row.part_id, v_req, v_row.work_order_id);
    if found and v_res.applied_delta is not null then
      v_applied := v_res.applied_delta;
      v_old := v_res.old_qty;
      v_new := v_res.new_qty;
    end if;
    v_deducted := v_deducted - v_applied;
  end if;

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

-- ── member-writable tables ─────────────────────────────────────────────────
-- api_keys: admin only (the settings route already requires admin; the v1/MCP
-- auth path reads with the service role).
drop policy if exists api_keys_admin_only on public.api_keys;
create policy api_keys_admin_only on public.api_keys as restrictive for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin' and p.status = 'active'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin' and p.status = 'active'));

-- zapier_webhook_subscriptions: written only by the API-key-authenticated
-- hooks routes (service role); members get read-only for admins.
drop policy if exists zapier_subs_admin_only on public.zapier_webhook_subscriptions;
create policy zapier_subs_admin_only on public.zapier_webhook_subscriptions as restrictive for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin' and p.status = 'active'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin' and p.status = 'active'));

-- integrations: every provider's row (QuickBooks config holds OAuth tokens)
-- is admin-only, not just zapier/samsara.
drop policy if exists org_members_integrations on public.integrations;
create policy org_members_integrations on public.integrations for all
  using (org_id = my_org_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin'))
  with check (org_id = my_org_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin'));

-- crm_payment_allocations: crew have no business touching money rows
-- (crm_payments / crm_invoices already exclude crew).
drop policy if exists allocations_no_crew on public.crm_payment_allocations;
create policy allocations_no_crew on public.crm_payment_allocations as restrictive for all
  using (my_role() is distinct from 'crew')
  with check (my_role() is distinct from 'crew');

-- client portal linkage: only holders of the portal-management permission
-- (admins always) may write, and the client must belong to the row's org.
-- Invite tokens are readable only by the same people.
drop policy if exists portal_users_write_guard_ins on public.client_portal_users;
drop policy if exists portal_users_write_guard_upd on public.client_portal_users;
drop policy if exists portal_users_write_guard_del on public.client_portal_users;
create policy portal_users_write_guard_ins on public.client_portal_users as restrictive for insert
  with check (has_settings_permission('client_reset_portal_password')
              and exists (select 1 from public.clients c where c.id = client_portal_users.client_id and c.org_id = client_portal_users.org_id));
create policy portal_users_write_guard_upd on public.client_portal_users as restrictive for update
  using (has_settings_permission('client_reset_portal_password'))
  with check (has_settings_permission('client_reset_portal_password')
              and exists (select 1 from public.clients c where c.id = client_portal_users.client_id and c.org_id = client_portal_users.org_id));
create policy portal_users_write_guard_del on public.client_portal_users as restrictive for delete
  using (has_settings_permission('client_reset_portal_password'));

drop policy if exists portal_invites_guard on public.client_portal_invites;
create policy portal_invites_guard on public.client_portal_invites as restrictive for all
  using (has_settings_permission('client_reset_portal_password'))
  with check (has_settings_permission('client_reset_portal_password')
              and exists (select 1 from public.clients c where c.id = client_portal_invites.client_id and c.org_id = client_portal_invites.org_id));

-- portal settings: readable by the org (portal pages read them with the
-- service client anyway), writable by admins/managers or crm_settings holders.
drop policy if exists portal_settings_write_guard_ins on public.client_portal_settings;
drop policy if exists portal_settings_write_guard_upd on public.client_portal_settings;
drop policy if exists portal_settings_write_guard_del on public.client_portal_settings;
create policy portal_settings_write_guard_ins on public.client_portal_settings as restrictive for insert
  with check (my_role() in ('admin', 'manager') or has_settings_permission('crm_settings'));
create policy portal_settings_write_guard_upd on public.client_portal_settings as restrictive for update
  using (my_role() in ('admin', 'manager') or has_settings_permission('crm_settings'));
create policy portal_settings_write_guard_del on public.client_portal_settings as restrictive for delete
  using (my_role() in ('admin', 'manager') or has_settings_permission('crm_settings'));

-- pm_schedule_pauses: the schedule must be in the same org.
drop policy if exists pm_pauses_schedule_same_org on public.pm_schedule_pauses;
create policy pm_pauses_schedule_same_org on public.pm_schedule_pauses as restrictive for all
  using (exists (select 1 from public.pm_schedules s where s.id = pm_schedule_pauses.pm_schedule_id and s.org_id = pm_schedule_pauses.org_id))
  with check (exists (select 1 from public.pm_schedules s where s.id = pm_schedule_pauses.pm_schedule_id and s.org_id = pm_schedule_pauses.org_id));

-- ── forms ──────────────────────────────────────────────────────────────────
drop policy if exists crm_form_responses_public_insert on public.crm_form_responses;

drop policy if exists form_attachments_insert on storage.objects;
create policy form_attachments_insert on storage.objects for insert to public
  with check (
    bucket_id = 'form-attachments'
    and exists (
      select 1 from public.crm_forms f
      where f.id::text = (storage.foldername(objects.name))[1]
        and f.deleted_at is null
        and (f.status = 'published' or f.org_id = my_org_id())
    )
  );

drop policy if exists form_attachments_select on storage.objects;
create policy form_attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'form-attachments'
    and exists (
      select 1 from public.crm_forms f
      where f.id::text = (storage.foldername(objects.name))[1]
        and f.deleted_at is null
        and f.org_id = my_org_id()
    )
  );

-- Not needed by callers; only the approval guard triggers use it.
revoke execute on function public._approval_actor_is_privileged() from authenticated;
