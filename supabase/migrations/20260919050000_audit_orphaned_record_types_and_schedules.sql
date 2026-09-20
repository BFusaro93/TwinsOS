-- ─────────────────────────────────────────────────────────────────────────────
-- Three audit trails that existed but were not reaching a screen.
--
-- Found by checking what audit_log actually CONTAINS per record_type rather
-- than trusting that a trigger implies a working trail:
--
-- 1. product_item — 64 live entries, newest today, real named actors, and
--    entirely invisible. These are the inventory movements that matter most on
--    a product ("received via PO PO-2026-000370 +244", "used on job -3"), but
--    adjust_product_item_quantity writes record_type 'product_item' while the
--    Products screen reads 'product'. 20260815025644 fixed the trigger side of
--    exactly this and missed the RPC side.
--
-- 2. project_change_orders — the trigger fires but fn_audit_log has no mapping
--    for the table, so it fell through to `else TG_TABLE_NAME` and wrote the
--    raw table name. Nothing renders that, so seven change orders on real
--    projects — including two approvals that moved contract_price — were
--    recorded nowhere a person can see. They now roll up onto the PROJECT,
--    which already has an Audit Trail tab, and an approval reads as an
--    approval rather than a status diff.
--
-- 3. crm_schedules had no trigger at all. A schedule is the recurrence
--    definition driving visit generation, so editing one silently changes when
--    every job on it gets serviced and billed.
--
-- The backfill below rewrites ONLY record_type (and, for change orders,
-- record_id so the entry hangs off its project). Actor, description, values
-- and timestamps are untouched — this makes existing history visible, it does
-- not restate it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Stop the RPC writing a record_type no screen reads ────────────────────

CREATE OR REPLACE FUNCTION public.adjust_product_item_quantity(
  p_org_id uuid, p_product_id uuid, p_delta numeric, p_reason text
)
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

  if v_user_id is null or p_org_id != public.my_org_id() then
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

-- ── 2. Teach fn_audit_log about change orders and schedules ──────────────────
-- Surgical ALTERs are not possible on a PL/pgSQL body, so the two CASE arms and
-- the child list are added by replacing the function. The body is otherwise
-- byte-identical to 20260918210000 — verified by md5 after applying.

CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record_type   text;
  v_record_id     uuid;
  v_org_id        uuid;
  v_action        text;
  v_description   text;
  v_lead          text;
  v_old_val       text;
  v_new_val       text;
  v_user_id       uuid;
  v_user_name     text;
  v_skip_client_fallback boolean;
  r_old           jsonb;
  r_new           jsonb;
  v_title         text;
  v_line_kind     text;
  v_cost_note     text;
  v_key           text;
  v_changed_parts text[];
  v_skip_keys     text[];
  v_old_field     text;
  v_new_field     text;
  v_label         text;
  v_disc_cents    integer;
  v_disc_type     text;
  v_disc_value    integer;
  v_disc_applied  uuid;
  v_disc_name     text;
  v_disc_note     text;
  v_is_child      boolean;
  v_parent_fk     text;
begin
  -- Escape hatch for bulk/system routines that would otherwise flood the
  -- trail with machine-generated noise (mirrors app.suppress_parts_qty_audit).
  if coalesce(current_setting('app.suppress_audit', true), '') = 'true' then
    return coalesce(NEW, OLD);
  end if;

  r_old := case when TG_OP = 'INSERT' then '{}'::jsonb else row_to_json(OLD)::jsonb end;
  r_new := case when TG_OP = 'DELETE' then '{}'::jsonb else row_to_json(NEW)::jsonb end;

  v_org_id := coalesce((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);

  -- A profile moving between orgs is the exact shape of the cross-org
  -- escalation this repo has already had once. Logging it under the NEW
  -- org would hide it from the org the user just left, so keep the entry
  -- with the original org and let the description carry the move.
  if TG_TABLE_NAME = 'profiles' and TG_OP = 'UPDATE'
     and (r_old ->> 'org_id') is distinct from (r_new ->> 'org_id') then
    v_org_id := (r_old ->> 'org_id')::uuid;
  end if;

  -- ── Attribution ────────────────────────────────────────────────────────────
  -- 1. The authenticated user, when there is one.
  begin
    select id, coalesce(name, email, id::text)
    into v_user_id, v_user_name
    from profiles
    where id = auth.uid();
  exception when others then
    v_user_id   := null;
    v_user_name := null;
  end;

  -- 2. created_by, but ONLY on INSERT. On an UPDATE this names the record's
  --    original creator rather than whoever actually made the edit.
  if v_user_name is null and TG_OP = 'INSERT' then
    begin
      select id, coalesce(name, email, id::text)
      into v_user_id, v_user_name
      from profiles
      where id = (r_new ->> 'created_by')::uuid;
    exception when others then
      v_user_id   := null;
      v_user_name := null;
    end;
  end if;

  -- 3. The client's own name, but only for a genuine client-portal writer.
  --    Previously any unattributed write on a row with a client_id was
  --    blamed on the customer.
  v_skip_client_fallback := (
    TG_TABLE_NAME = 'crm_invoices' and (
      TG_OP = 'INSERT'
      or ((r_old ->> 'invoice_number') is null and (r_new ->> 'invoice_number') is not null)
    )
  );

  if v_user_name is null and not v_skip_client_fallback then
    begin
      if is_client_portal_user() then
        select display_name into v_user_name
        from clients
        where id = coalesce((r_new ->> 'client_id')::uuid, (r_old ->> 'client_id')::uuid);
      end if;
    exception when others then
      v_user_name := null;
    end;
  end if;

  v_user_name := coalesce(v_user_name, 'system');

  -- ── Child tables: roll the entry up onto the parent record ─────────────────
  v_is_child := TG_TABLE_NAME in (
    -- pre-existing
    'crm_invoice_line_items', 'estimate_line_items',
    'wo_parts', 'wo_labor_entries', 'wo_vendor_charges',
    -- added here
    'crm_payments', 'crm_payment_allocations',
    'crm_job_services', 'crm_job_products', 'crm_job_materials',
    'crm_chemical_applications', 'crm_crew_member_times',
    'crm_contract_services', 'estimate_milestones',
    'client_properties', 'client_contacts',
    -- added 2026-09-18 (high/medium value sweep)
    'approval_requests', 'approval_flow_steps', 'goods_receipt_lines',
    'estimate_direct_costs', 'estimate_versions', 'estimate_change_requests',
    'project_direct_items', 'project_subcontract_costs',
    'crm_automation_sequences', 'crm_sequence_triggers',
    'crm_sequence_trigger_conditions', 'crm_sequence_stop_conditions',
    'crm_service_rate_matrix', 'crm_snow_rate_tiers',
    'crm_crew_members', 'client_portal_users', 'client_portal_invites',
    -- added 2026-09-19: the trigger existed but had no mapping, so entries
    -- were written under the raw table name and no screen could show them.
    'project_change_orders'
  );

  if v_is_child then

    -- Which column points at the parent, and what record_type that parent is.
    v_parent_fk := case TG_TABLE_NAME
      when 'crm_invoice_line_items'   then 'invoice_id'
      when 'estimate_line_items'      then 'estimate_id'
      when 'crm_payment_allocations'  then 'invoice_id'
      when 'crm_contract_services'    then 'contract_id'
      when 'crm_crew_member_times'    then 'visit_id'
      when 'client_properties'        then 'client_id'
      when 'client_contacts'          then 'client_id'
      when 'crm_job_services'         then 'job_id'
      when 'crm_job_products'         then 'job_id'
      when 'crm_job_materials'        then 'job_id'
      when 'crm_chemical_applications' then 'job_id'
      when 'estimate_milestones'      then
        case when coalesce(r_new ->> 'estimate_id', r_old ->> 'estimate_id') is not null
             then 'estimate_id' else 'project_id' end
      when 'crm_payments'             then
        case when coalesce(r_new ->> 'invoice_id', r_old ->> 'invoice_id') is not null
             then 'invoice_id' else 'client_id' end
      -- An approval decision belongs on the thing being approved. entity_type
      -- is already the record kind, so this is a direct hand-off.
      when 'approval_requests'        then 'entity_id'
      when 'approval_flow_steps'      then 'flow_id'
      when 'goods_receipt_lines'      then 'receipt_id'
      when 'estimate_direct_costs'    then 'estimate_id'
      when 'estimate_versions'        then 'estimate_id'
      when 'estimate_change_requests' then 'estimate_id'
      when 'project_direct_items'     then 'project_id'
      when 'project_subcontract_costs' then 'project_id'
      when 'crm_automation_sequences' then 'automation_id'
      -- Two and three hops up to the automation the rule belongs to.
      when 'crm_sequence_triggers'           then 'sequence_id'
      when 'crm_sequence_stop_conditions'    then 'sequence_id'
      when 'crm_sequence_trigger_conditions' then 'trigger_id'
      when 'crm_service_rate_matrix'  then 'service_id'
      when 'crm_snow_rate_tiers'      then 'job_id'
      when 'crm_crew_members'         then 'crew_id'
      when 'client_portal_users'      then 'client_id'
      when 'client_portal_invites'    then 'client_id'
      when 'project_change_orders'    then 'project_id'
      else 'work_order_id'
    end;

    v_record_type := case v_parent_fk
      when 'invoice_id'   then 'invoice'
      when 'estimate_id'  then 'estimate'
      when 'contract_id'  then 'contract'
      when 'visit_id'     then 'job_visit'
      when 'client_id'    then 'client'
      when 'job_id'       then 'job'
      when 'project_id'   then 'project'
      when 'receipt_id'   then 'receiving'
      when 'flow_id'      then 'approval_flow'
      when 'crew_id'      then 'crew'
      when 'service_id'   then 'service'
      when 'automation_id' then 'automation'
      when 'sequence_id'  then 'automation'
      when 'trigger_id'   then 'automation'
      when 'entity_id'    then case coalesce(r_new ->> 'entity_type', r_old ->> 'entity_type')
                                 when 'purchase_order' then 'po'
                                 when 'requisition'    then 'requisition'
                                 when 'crm_estimate'   then 'estimate'
                                 else coalesce(r_new ->> 'entity_type', r_old ->> 'entity_type')
                               end
      else 'work_order'
    end;

    v_record_id := coalesce(
      (r_new ->> v_parent_fk)::uuid,
      (r_old ->> v_parent_fk)::uuid
    );

    -- Sequence rules live two or three tables below the automation they
    -- belong to; walk up so the entry lands on the automation itself.
    if v_parent_fk = 'trigger_id' then
      select s.automation_id into v_record_id
        from crm_sequence_triggers t
        join crm_automation_sequences s on s.id = t.sequence_id
       where t.id = v_record_id;
    elsif v_parent_fk = 'sequence_id' then
      select s.automation_id into v_record_id
        from crm_automation_sequences s where s.id = v_record_id;
    end if;

    -- A child row with no parent has nowhere to be displayed; skip rather
    -- than write an orphan entry (record_id is NOT NULL).
    if v_record_id is null then
      return coalesce(NEW, OLD);
    end if;

    if v_org_id is null then
      v_org_id := case v_record_type
        when 'invoice'    then (select org_id from crm_invoices where id = v_record_id)
        when 'estimate'   then (select org_id from estimates     where id = v_record_id)
        when 'contract'   then (select org_id from crm_contracts where id = v_record_id)
        when 'job_visit'  then (select org_id from crm_job_visits where id = v_record_id)
        when 'client'     then (select org_id from clients       where id = v_record_id)
        when 'job'        then (select org_id from crm_jobs      where id = v_record_id)
        when 'project'    then (select org_id from projects      where id = v_record_id)
        when 'receiving'  then (select org_id from goods_receipts where id = v_record_id)
        when 'approval_flow' then (select org_id from approval_flows where id = v_record_id)
        when 'crew'       then (select org_id from crm_crews     where id = v_record_id)
        when 'service'    then (select org_id from crm_services  where id = v_record_id)
        when 'automation' then (select org_id from crm_automations where id = v_record_id)
        when 'po'         then (select org_id from purchase_orders where id = v_record_id)
        when 'requisition' then (select org_id from requisitions where id = v_record_id)
        else (select org_id from work_orders where id = v_record_id)
      end;
    end if;

    v_line_kind := case TG_TABLE_NAME
      when 'wo_parts'                  then 'Part'
      when 'wo_labor_entries'          then 'Labor'
      when 'wo_vendor_charges'         then 'Vendor charge'
      when 'crm_payments'              then 'Payment'
      when 'crm_payment_allocations'   then 'Payment allocation'
      when 'crm_job_services'          then 'Service'
      when 'crm_job_products'          then 'Product'
      when 'crm_job_materials'         then 'Material'
      when 'crm_chemical_applications' then 'Chemical application'
      when 'crm_crew_member_times'     then 'Crew time'
      when 'crm_contract_services'     then 'Contract service'
      when 'estimate_milestones'       then 'Milestone'
      when 'client_properties'         then 'Property'
      when 'client_contacts'           then 'Contact'
      when 'approval_requests'         then 'Approval'
      when 'approval_flow_steps'       then 'Approval step'
      when 'goods_receipt_lines'       then 'Receipt line'
      when 'estimate_direct_costs'     then 'Direct cost'
      when 'estimate_versions'         then 'Version'
      when 'estimate_change_requests'  then 'Change request'
      when 'project_direct_items'      then 'Direct item'
      when 'project_subcontract_costs' then 'Subcontract cost'
      when 'crm_automation_sequences'  then 'Sequence'
      when 'crm_sequence_triggers'     then 'Sequence trigger'
      when 'crm_sequence_trigger_conditions' then 'Trigger condition'
      when 'crm_sequence_stop_conditions'    then 'Stop condition'
      when 'crm_service_rate_matrix'   then 'Rate matrix row'
      when 'crm_snow_rate_tiers'       then 'Snow rate tier'
      when 'crm_crew_members'          then 'Crew member'
      when 'client_portal_users'       then 'Portal user'
      when 'client_portal_invites'     then 'Portal invite'
      when 'project_change_orders'     then 'Change order'
      else 'Line item'
    end;

    v_title := case TG_TABLE_NAME
      when 'crm_invoice_line_items' then coalesce(
        nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''),
        nullif(r_new ->> 'description', ''), nullif(r_old ->> 'description', ''),
        'line item')
      when 'estimate_line_items' then coalesce(nullif(r_new ->> 'service_name', ''), nullif(r_old ->> 'service_name', ''), 'line item')
      when 'wo_parts' then coalesce(nullif(r_new ->> 'part_name', ''), nullif(r_old ->> 'part_name', ''), 'part')
      when 'wo_labor_entries' then coalesce(
        nullif(r_new ->> 'technician_name', ''), nullif(r_old ->> 'technician_name', ''),
        nullif(r_new ->> 'description', ''), nullif(r_old ->> 'description', ''),
        'labor entry')
      when 'wo_vendor_charges' then coalesce(nullif(r_new ->> 'vendor_name', ''), nullif(r_old ->> 'vendor_name', ''), 'vendor charge')
      when 'crm_payments' then
        coalesce(nullif(r_new ->> 'method', ''), nullif(r_old ->> 'method', ''), 'payment')
        || case when coalesce(nullif(r_new ->> 'reference', ''), nullif(r_old ->> 'reference', '')) is not null
                then ' #' || coalesce(nullif(r_new ->> 'reference', ''), nullif(r_old ->> 'reference', ''))
                else '' end
      when 'crm_payment_allocations' then 'allocation'
      when 'crm_job_services' then coalesce(nullif(r_new ->> 'service_name', ''), nullif(r_old ->> 'service_name', ''), 'service')
      when 'crm_job_products' then coalesce(nullif(r_new ->> 'product_name', ''), nullif(r_old ->> 'product_name', ''), 'product')
      when 'crm_job_materials' then coalesce(nullif(r_new ->> 'description', ''), nullif(r_old ->> 'description', ''), 'material')
      when 'crm_chemical_applications' then coalesce(
        (select name from product_items
          where id = coalesce((r_new ->> 'product_id')::uuid, (r_old ->> 'product_id')::uuid)),
        'chemical')
      when 'crm_crew_member_times' then coalesce(
        -- crew_member_id points at crm_crew_members (a crew roster slot),
        -- which carries its own name and optionally links to an employee.
        (select coalesce(
                  nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
                  nullif(cm.name, ''))
           from crm_crew_members cm
           left join crm_employees e on e.id = cm.employee_id
          where cm.id = coalesce((r_new ->> 'crew_member_id')::uuid, (r_old ->> 'crew_member_id')::uuid)),
        'crew member')
      when 'crm_contract_services' then coalesce(nullif(r_new ->> 'service_name', ''), nullif(r_old ->> 'service_name', ''), 'service')
      when 'estimate_milestones' then coalesce(nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''), 'milestone')
      when 'client_properties' then coalesce(
        nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''),
        nullif(r_new ->> 'address', ''), nullif(r_old ->> 'address', ''), 'property')
      when 'client_contacts' then coalesce(
        nullif(trim(coalesce(r_new ->> 'first_name', '') || ' ' || coalesce(r_new ->> 'last_name', '')), ''),
        nullif(trim(coalesce(r_old ->> 'first_name', '') || ' ' || coalesce(r_old ->> 'last_name', '')), ''),
        'contact')
      when 'approval_requests' then coalesce(
        nullif(r_new ->> 'approver_name', ''), nullif(r_old ->> 'approver_name', ''),
        nullif(r_new ->> 'approver_role', ''), nullif(r_old ->> 'approver_role', ''),
        'approver')
      when 'approval_flow_steps' then coalesce(
        nullif(r_new ->> 'label', ''), nullif(r_old ->> 'label', ''),
        nullif(r_new ->> 'required_role', ''), nullif(r_old ->> 'required_role', ''),
        'step')
      when 'goods_receipt_lines' then coalesce(
        nullif(r_new ->> 'product_item_name', ''), nullif(r_old ->> 'product_item_name', ''),
        nullif(r_new ->> 'part_number', ''), nullif(r_old ->> 'part_number', ''), 'line')
      when 'estimate_direct_costs' then coalesce(nullif(r_new ->> 'description', ''), nullif(r_old ->> 'description', ''), 'direct cost')
      when 'estimate_versions' then 'v' || coalesce(r_new ->> 'version_number', r_old ->> 'version_number', '?')
      when 'estimate_change_requests' then coalesce(
        nullif(r_new ->> 'requester_name', ''), nullif(r_old ->> 'requester_name', ''), 'client request')
      when 'project_direct_items' then coalesce(
        nullif(r_new ->> 'product_item_name', ''), nullif(r_old ->> 'product_item_name', ''), 'item')
      when 'project_subcontract_costs' then coalesce(
        nullif(r_new ->> 'vendor_name', ''), nullif(r_old ->> 'vendor_name', ''),
        nullif(r_new ->> 'description', ''), nullif(r_old ->> 'description', ''), 'subcontract')
      when 'crm_automation_sequences' then coalesce(nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''), 'sequence')
      when 'crm_sequence_triggers' then coalesce(nullif(r_new ->> 'trigger_type', ''), nullif(r_old ->> 'trigger_type', ''), 'trigger')
      when 'crm_sequence_trigger_conditions' then coalesce(nullif(r_new ->> 'field', ''), nullif(r_old ->> 'field', ''), 'condition')
      when 'crm_sequence_stop_conditions' then coalesce(nullif(r_new ->> 'field', ''), nullif(r_old ->> 'field', ''), 'condition')
      when 'crm_service_rate_matrix' then coalesce(
        nullif(r_new ->> 'from_val', ''), nullif(r_old ->> 'from_val', ''), 'row')
      when 'crm_snow_rate_tiers' then coalesce(r_new ->> 'min_inches', r_old ->> 'min_inches', '?')
        || '–' || coalesce(r_new ->> 'max_inches', r_old ->> 'max_inches', '?') || '"'
      when 'crm_crew_members' then coalesce(nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''), 'member')
      when 'client_portal_users' then coalesce(nullif(r_new ->> 'email', ''), nullif(r_old ->> 'email', ''), 'portal user')
      when 'client_portal_invites' then coalesce(nullif(r_new ->> 'email', ''), nullif(r_old ->> 'email', ''), 'invite')
      when 'project_change_orders' then
        'CO #' || coalesce(nullif(r_new ->> 'co_number', ''), nullif(r_old ->> 'co_number', ''), '?')
        || ' ' || coalesce(nullif(r_new ->> 'title', ''), nullif(r_old ->> 'title', ''), '')
      else 'line item'
    end;

    v_cost_note := case TG_TABLE_NAME
      when 'wo_parts' then
        ' — qty ' || coalesce(r_new ->> 'quantity', r_old ->> 'quantity', '0')
        || ' @ $' || to_char(coalesce((r_new ->> 'unit_cost')::numeric, (r_old ->> 'unit_cost')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'wo_labor_entries' then
        ' — ' || coalesce(r_new ->> 'hours', r_old ->> 'hours', '0') || 'h @ $'
        || to_char(coalesce((r_new ->> 'hourly_rate')::numeric, (r_old ->> 'hourly_rate')::numeric, 0) / 100.0, 'FM999999990.00') || '/hr'
      when 'wo_vendor_charges' then
        ' — $' || to_char(coalesce((r_new ->> 'cost')::numeric, (r_old ->> 'cost')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_invoice_line_items' then
        ' — $' || to_char(coalesce((r_new ->> 'total_cents')::numeric, (r_old ->> 'total_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'estimate_line_items' then
        ' — $' || to_char(coalesce((r_new ->> 'total_cents')::numeric, (r_old ->> 'total_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_payments' then
        ' — $' || to_char(coalesce((r_new ->> 'amount_cents')::numeric, (r_old ->> 'amount_cents')::numeric, 0) / 100.0, 'FM999999990.00')
        || case when coalesce(r_new ->> 'payment_date', r_old ->> 'payment_date') is not null
                then ' on ' || coalesce(r_new ->> 'payment_date', r_old ->> 'payment_date') else '' end
      when 'crm_payment_allocations' then
        ' — $' || to_char(coalesce((r_new ->> 'amount_cents')::numeric, (r_old ->> 'amount_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_job_services' then
        ' — qty ' || coalesce(r_new ->> 'qty', r_old ->> 'qty', '0')
        || ' @ $' || to_char(coalesce((r_new ->> 'rate_cents')::numeric, (r_old ->> 'rate_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_job_products' then
        ' — qty ' || coalesce(r_new ->> 'qty', r_old ->> 'qty', '0')
        || ' @ $' || to_char(coalesce((r_new ->> 'unit_price_cents')::numeric, (r_old ->> 'unit_price_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_job_materials' then
        ' — qty ' || coalesce(r_new ->> 'qty', r_old ->> 'qty', '0')
        || ' @ $' || to_char(coalesce((r_new ->> 'unit_cost_cents')::numeric, (r_old ->> 'unit_cost_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_chemical_applications' then
        ' — ' || coalesce(r_new ->> 'chemical_amount', r_old ->> 'chemical_amount', '?')
        || ' in ' || coalesce(r_new ->> 'solution_amount', r_old ->> 'solution_amount', '?')
      when 'crm_crew_member_times' then
        ' — ' || coalesce(r_new ->> 'clocked_in_at', r_old ->> 'clocked_in_at', '?')
        || ' → ' || coalesce(r_new ->> 'clocked_out_at', r_old ->> 'clocked_out_at', 'open')
      when 'crm_contract_services' then
        ' — ' || coalesce(r_new ->> 'visits_included', r_old ->> 'visits_included', '0') || ' visits'
      when 'estimate_milestones' then
        ' — $' || to_char(coalesce((r_new ->> 'amount_cents')::numeric, (r_old ->> 'amount_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'goods_receipt_lines' then
        ' — received ' || coalesce(r_new ->> 'quantity_received', r_old ->> 'quantity_received', '0')
        || ' of ' || coalesce(r_new ->> 'quantity_ordered', r_old ->> 'quantity_ordered', '0')
      when 'estimate_direct_costs' then
        ' — $' || to_char(coalesce((r_new ->> 'total_cents')::numeric, (r_old ->> 'total_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'project_direct_items' then
        ' — qty ' || coalesce(r_new ->> 'quantity', r_old ->> 'quantity', '0')
        || ' @ $' || to_char(coalesce((r_new ->> 'unit_cost')::numeric, (r_old ->> 'unit_cost')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'project_subcontract_costs' then
        ' — $' || to_char(coalesce((r_new ->> 'amount')::numeric, (r_old ->> 'amount')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_service_rate_matrix' then
        ' — $' || to_char(coalesce((r_new ->> 'rate_cents')::numeric, (r_old ->> 'rate_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'crm_snow_rate_tiers' then
        ' — $' || to_char(coalesce((r_new ->> 'rate_cents')::numeric, (r_old ->> 'rate_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      when 'project_change_orders' then
        ' — $' || to_char(coalesce((r_new ->> 'amount_cents')::numeric, (r_old ->> 'amount_cents')::numeric, 0) / 100.0, 'FM999999990.00')
      else ''
    end;

    -- An approval request changing status IS the approval event. It is the
    -- most consequential row in procurement, so it gets its own phrasing
    -- rather than a generic "status: pending → approved" field diff.
    if TG_TABLE_NAME = 'approval_requests' and TG_OP = 'UPDATE'
       and (r_old ->> 'status') is distinct from (r_new ->> 'status') then
      v_action    := 'status_changed';
      v_old_val   := r_old ->> 'status';
      v_new_val   := r_new ->> 'status';
      v_description := 'Approval step ' || coalesce(r_new ->> 'order', r_old ->> 'order', '?')
                       || ' ' || coalesce(r_new ->> 'status', '?') || ' by ' || v_title
                       || case when nullif(r_new ->> 'comment', '') is not null
                               then ' — "' || left(r_new ->> 'comment', 120) || '"' else '' end;

      if v_org_id is null then return coalesce(NEW, OLD); end if;
      insert into public.audit_log (
        org_id, created_by, record_type, record_id, action,
        changed_by_name, description, old_value, new_value
      ) values (
        v_org_id, v_user_id, v_record_type, v_record_id, v_action,
        v_user_name, v_description, v_old_val, v_new_val
      );
      return coalesce(NEW, OLD);
    end if;

    -- Approving a change order is what moves the project's contract price, so
    -- it reads as a decision rather than a status field diff.
    if TG_TABLE_NAME = 'project_change_orders' and TG_OP = 'UPDATE'
       and (r_old ->> 'status') is distinct from (r_new ->> 'status') then
      v_action      := 'status_changed';
      v_old_val     := r_old ->> 'status';
      v_new_val     := r_new ->> 'status';
      v_description := 'Change order ' || v_title || ' ' || coalesce(r_new ->> 'status', '?')
                       || v_cost_note;

      if v_org_id is null then return coalesce(NEW, OLD); end if;
      insert into public.audit_log (
        org_id, created_by, record_type, record_id, action,
        changed_by_name, description, old_value, new_value
      ) values (
        v_org_id, v_user_id, v_record_type, v_record_id, v_action,
        v_user_name, v_description, v_old_val, v_new_val
      );
      return coalesce(NEW, OLD);
    end if;

    if TG_OP = 'INSERT' then
      v_action      := 'created';
      v_description := v_line_kind || ' added: ' || v_title || v_cost_note;

    elsif TG_OP = 'DELETE' then
      v_action      := 'deleted';
      v_description := v_line_kind || ' removed: ' || v_title || v_cost_note;

    else
      if (r_old ->> 'deleted_at') is null and (r_new ->> 'deleted_at') is not null then
        v_action      := 'deleted';
        v_description := v_line_kind || ' removed: ' || v_title || v_cost_note;
      else
        v_changed_parts := array[]::text[];

        if (r_old ->> 'discount_cents') is distinct from (r_new ->> 'discount_cents') then
          v_disc_cents   := (r_new ->> 'discount_cents')::integer;
          v_disc_type    := r_new ->> 'discount_type';
          v_disc_value   := (r_new ->> 'discount_value')::integer;
          v_disc_applied := (r_new ->> 'applied_discount_id')::uuid;
          v_disc_name    := null;
          if v_disc_applied is not null then
            select name into v_disc_name from crm_discounts where id = v_disc_applied;
          end if;
          if coalesce(v_disc_cents, 0) = 0 then
            v_changed_parts := v_changed_parts || 'discount removed'::text;
          else
            v_disc_note := 'discount: $' || to_char(v_disc_cents / 100.0, 'FM999999990.00');
            if v_disc_type = 'percent' then
              v_disc_note := v_disc_note || ' (' || to_char(coalesce(v_disc_value, 0) / 100.0, 'FM990.00') || '%'
                             || case when v_disc_name is not null then ' — ' || v_disc_name else '' end || ')';
            elsif v_disc_name is not null then
              v_disc_note := v_disc_note || ' (' || v_disc_name || ')';
            end if;
            v_changed_parts := v_changed_parts || v_disc_note;
          end if;
        end if;

        v_skip_keys := array[
          'updated_at','created_at','org_id','id','created_by',
          'invoice_id','estimate_id','work_order_id','job_id','client_id',
          'contract_id','visit_id','project_id','receipt_id','flow_id',
          'crew_id','service_id','automation_id','sequence_id','trigger_id',
          'entity_id','entity_type','last_used_at','quantity_remaining',
          'billing_allocation','co_number','approved_at','approved_by',
          'sort_order','total_cost_cents','total_budgeted_hours',
          'margin_bps','markup_bps','deleted_at',
          'discount_cents','discount_type','discount_value','applied_discount_id'
        ];

        for v_key in select jsonb_object_keys(r_new) loop
          continue when v_key = any(v_skip_keys);
          if (r_old ->> v_key) is distinct from (r_new ->> v_key) then
            v_changed_parts := v_changed_parts
              || fn_audit_format_change(v_key, r_old ->> v_key, r_new ->> v_key);
          end if;
        end loop;

        -- Every entry was a skipped/derived column: nothing worth recording.
        v_changed_parts := array_remove(v_changed_parts, null);

        if array_length(v_changed_parts, 1) is null then
          return coalesce(NEW, OLD);
        end if;

        v_action      := 'updated';
        v_description := v_line_kind || ' ' || v_title || ' updated — ' || array_to_string(v_changed_parts, '; ');
      end if;
    end if;

    -- audit_log.org_id is NOT NULL. A row that has no org yet (a profile
    -- created mid-signup, a client-credentials token) must not turn its
    -- own INSERT into a constraint failure — skip the entry instead.
    if v_org_id is null then
      return coalesce(NEW, OLD);
    end if;

    insert into public.audit_log (
      org_id, created_by, record_type, record_id, action,
      changed_by_name, description, old_value, new_value
    ) values (
      v_org_id, v_user_id, v_record_type, v_record_id, v_action,
      v_user_name, v_description, v_old_val, v_new_val
    );

    return coalesce(NEW, OLD);
  end if;

  -- ── Top-level records ──────────────────────────────────────────────────────

  v_record_id := coalesce((r_new ->> 'id')::uuid, (r_old ->> 'id')::uuid);

  v_record_type := case TG_TABLE_NAME
    when 'requisitions'          then 'requisition'
    when 'purchase_orders'       then 'po'
    when 'work_orders'           then 'work_order'
    when 'assets'                then 'asset'
    when 'vehicles'              then 'vehicle'
    when 'parts'                 then 'part'
    when 'product_items'         then 'product'
    when 'projects'              then 'project'
    when 'maintenance_requests'  then 'request'
    when 'vendors'               then 'vendor'
    when 'pm_schedules'          then 'pm_schedule'
    when 'meter_readings'        then 'meter_reading'
    when 'goods_receipts'        then 'receiving'
    when 'damage_cases'          then 'damage_case'
    when 'photo_jobs'            then 'job_photo'
    when 'clients'               then 'client'
    when 'crm_tickets'           then 'ticket'
    when 'crm_jobs'              then 'job'
    when 'crm_job_visits'        then 'job_visit'
    when 'crm_invoices'          then 'invoice'
    when 'estimates'             then 'estimate'
    when 'crm_contracts'         then 'contract'
    when 'crm_services'          then 'service'
    when 'crm_packages'          then 'package'
    when 'crm_employees'         then 'employee'
    when 'crm_roles'             then 'role'
    when 'crm_discounts'         then 'discount'
    when 'crm_overhead_settings' then 'overhead_settings'
    when 'profiles'              then 'user'
    when 'api_keys'              then 'api_key'
    when 'integrations'          then 'integration'
    when 'oauth_tokens'          then 'oauth_token'
    when 'financial_periods'     then 'financial_period'
    when 'approval_flows'        then 'approval_flow'
    when 'crm_automations'       then 'automation'
    when 'crm_crews'             then 'crew'
    when 'crm_document_templates' then 'document_template'
    when 'crm_email_templates'   then 'email_template'
    when 'crm_schedules'         then 'schedule'
    else TG_TABLE_NAME
  end;

  v_title := case TG_TABLE_NAME
    when 'requisitions'    then coalesce(r_new ->> 'requisition_number', r_old ->> 'requisition_number', '')
    when 'purchase_orders' then coalesce(r_new ->> 'po_number',          r_old ->> 'po_number',          '')
    when 'work_orders'     then coalesce(r_new ->> 'work_order_number',  r_old ->> 'work_order_number',  '')
    when 'goods_receipts'  then coalesce(r_new ->> 'receipt_number',     r_old ->> 'receipt_number',     '')
    when 'damage_cases'    then coalesce(r_new ->> 'case_number',        r_old ->> 'case_number',        '')
    when 'photo_jobs'      then coalesce(r_new ->> 'name',               r_old ->> 'name',               '')
    when 'crm_invoices'    then 'Invoice #' || coalesce(r_new ->> 'invoice_number', r_old ->> 'invoice_number', '')
    when 'crm_tickets'     then coalesce(nullif(r_new ->> 'subject', ''), nullif(r_old ->> 'subject', ''), 'Ticket #' || coalesce(r_new ->> 'ticket_number', r_old ->> 'ticket_number', ''))
    when 'crm_jobs'        then 'Job #' || coalesce(r_new ->> 'job_number', r_old ->> 'job_number', '')
    when 'crm_job_visits'  then coalesce(
      (select 'Job #' || j.job_number
            || case when js.service_name is not null then ' (' || js.service_name || ')' else '' end
         from crm_jobs j
         left join crm_job_services js
           on js.id = coalesce((r_new ->> 'job_service_id')::uuid, (r_old ->> 'job_service_id')::uuid)
        where j.id = coalesce((r_new ->> 'job_id')::uuid, (r_old ->> 'job_id')::uuid)),
      'Visit') || ' — ' || coalesce(r_new ->> 'scheduled_date', r_old ->> 'scheduled_date', '')
    when 'vehicles'        then coalesce(
      nullif(trim(coalesce(r_new ->> 'year','') || ' ' || coalesce(r_new ->> 'make','') || ' ' || coalesce(r_new ->> 'model','')), ''),
      nullif(trim(coalesce(r_old ->> 'year','') || ' ' || coalesce(r_old ->> 'make','') || ' ' || coalesce(r_old ->> 'model','')), ''),
      '')
    when 'meter_readings'  then 'Reading ' || coalesce(r_new ->> 'value', r_old ->> 'value', '')
    when 'crm_employees'   then coalesce(
      nullif(trim(coalesce(r_new ->> 'first_name','') || ' ' || coalesce(r_new ->> 'last_name','')), ''),
      nullif(trim(coalesce(r_old ->> 'first_name','') || ' ' || coalesce(r_old ->> 'last_name','')), ''),
      'employee')
    when 'crm_overhead_settings' then 'Overhead settings'
    when 'profiles'        then coalesce(
      nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''),
      nullif(r_new ->> 'email', ''), nullif(r_old ->> 'email', ''), 'user')
    when 'api_keys'        then coalesce(nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''), 'API key')
      || ' (' || coalesce(r_new ->> 'key_prefix', r_old ->> 'key_prefix', '?') || '…)'
    when 'integrations'    then coalesce(r_new ->> 'provider', r_old ->> 'provider', 'integration')
    when 'oauth_tokens'    then coalesce(r_new ->> 'token_type', r_old ->> 'token_type', 'token')
      || ' for client ' || coalesce(r_new ->> 'client_id', r_old ->> 'client_id', '?')
    when 'financial_periods' then coalesce(r_new ->> 'period_month', r_old ->> 'period_month', '?')
      || ' ' || coalesce(r_new ->> 'record_type', r_old ->> 'record_type', '')
    when 'approval_flows'  then coalesce(nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''), 'flow')
      || ' (' || coalesce(r_new ->> 'entity_type', r_old ->> 'entity_type', '?') || ')'
    else coalesce(r_new ->> 'name', r_old ->> 'name', r_new ->> 'title', r_old ->> 'title',
                  r_new ->> 'display_name', r_old ->> 'display_name', v_record_id::text)
  end;

  if TG_OP = 'INSERT' then
    v_action      := 'created';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' created: ' || v_title;

  elsif TG_OP = 'UPDATE' then

    -- Soft-delete is terminal: nothing else about the row is worth narrating.
    if (r_old ->> 'deleted_at') is null and (r_new ->> 'deleted_at') is not null then
      v_action      := 'deleted';
      v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;

    else
      -- Decide the ACTION and the leading phrase from the most significant
      -- change, then append every OTHER changed field. Previously this was an
      -- elsif cascade, so a save that changed several things only recorded one.
      v_lead      := null;
      v_action    := 'updated';
      v_skip_keys := array[
        'updated_at','created_at','id','created_by','last_used_at',
        'balance_outstanding_cents','balance_uninvoiced_cents',
        'balance_credits_cents','balance_prepay_cents',
        'subtotal_cents','tax_cents','total_cents','balance_cents',
        'amount_paid_cents','deleted_at',
        'discount_cents','discount_type','discount_value','applied_discount_id',
        'cost_layers',
        -- work_orders/crm_tickets denormalise readable names alongside these
        -- ids; the *_name columns carry the change instead (see 20260901030000
        -- and 20260901050001).
        'assigned_to_id','assigned_to_ids','assigned_to_name','asset_id'
      ];

      -- org_id is noise everywhere except on a profile, where it IS the
      -- privilege change worth catching.
      if TG_TABLE_NAME <> 'profiles' then
        v_skip_keys := v_skip_keys || 'org_id'::text;
      end if;

      if TG_TABLE_NAME in ('parts', 'product_items')
        and (r_old ->> 'quantity_on_hand') is distinct from (r_new ->> 'quantity_on_hand')
      then
        if coalesce(current_setting('app.suppress_parts_qty_audit', true), '') = 'true' then
          return coalesce(NEW, OLD);
        end if;
        v_action    := 'qty_adjusted';
        v_lead      := v_title || ': qty ' || coalesce(r_old ->> 'quantity_on_hand', '?')
                       || ' → ' || coalesce(r_new ->> 'quantity_on_hand', '?');
        v_skip_keys := v_skip_keys || 'quantity_on_hand'::text;

      elsif (r_old ->> 'status') is distinct from (r_new ->> 'status')
        and (r_old ->> 'status') is not null
      then
        v_action    := 'status_changed';
        v_lead      := v_title || ' status: '
                       || coalesce(r_old ->> 'status', '?') || ' → ' || coalesce(r_new ->> 'status', '?');
        v_old_val   := r_old ->> 'status';
        v_new_val   := r_new ->> 'status';
        v_skip_keys := v_skip_keys || 'status'::text;

      elsif (r_old ->> 'is_archived') is distinct from (r_new ->> 'is_archived')
        and (r_new ->> 'is_archived') is not null
      then
        v_action    := case when (r_new ->> 'is_archived') = 'true' then 'archived' else 'unarchived' end;
        v_lead      := v_title || case when (r_new ->> 'is_archived') = 'true' then ' archived' else ' unarchived' end;
        v_old_val   := r_old ->> 'is_archived';
        v_new_val   := r_new ->> 'is_archived';
        v_skip_keys := v_skip_keys || 'is_archived'::text;
      end if;

      -- Parts/product quantity moves through adjust_part_quantity elsewhere;
      -- when it is not the headline change it is still derived noise.
      if v_action <> 'qty_adjusted' then
        v_skip_keys := v_skip_keys || 'quantity_on_hand'::text;
      end if;

      -- crm_jobs.budgeted_hours and rate_cents are recomputed from
      -- crm_job_services by trg_crm_job_services_recompute_*. Now that the
      -- services themselves are audited, logging the rolled-up total as well
      -- produces a second, less informative entry for the same edit.
      if TG_TABLE_NAME = 'crm_jobs' then
        v_skip_keys := v_skip_keys || array['budgeted_hours','rate_cents'];
      end if;

      v_changed_parts := array[]::text[];

      if TG_TABLE_NAME in ('crm_invoices', 'estimates')
        and (r_old ->> 'discount_cents') is distinct from (r_new ->> 'discount_cents')
      then
        v_disc_cents   := (r_new ->> 'discount_cents')::integer;
        v_disc_type    := r_new ->> 'discount_type';
        v_disc_value   := (r_new ->> 'discount_value')::integer;
        v_disc_applied := (r_new ->> 'applied_discount_id')::uuid;
        v_disc_name    := null;
        if v_disc_applied is not null then
          select name into v_disc_name from crm_discounts where id = v_disc_applied;
        end if;
        if coalesce(v_disc_cents, 0) = 0 then
          v_changed_parts := v_changed_parts || 'discount removed'::text;
        else
          v_disc_note := 'discount: $' || to_char(v_disc_cents / 100.0, 'FM999999990.00');
          if v_disc_type = 'percent' then
            v_disc_note := v_disc_note || ' (' || to_char(coalesce(v_disc_value, 0) / 100.0, 'FM990.00') || '%'
                           || case when v_disc_name is not null then ' — ' || v_disc_name else '' end || ')';
          elsif v_disc_name is not null then
            v_disc_note := v_disc_note || ' (' || v_disc_name || ')';
          end if;
          v_changed_parts := v_changed_parts || v_disc_note;
        end if;
      end if;

      for v_key in select jsonb_object_keys(r_new) loop
        continue when v_key = any(v_skip_keys);
        if (r_old ->> v_key) is distinct from (r_new ->> v_key) then
          v_changed_parts := v_changed_parts
            || fn_audit_format_change(v_key, r_old ->> v_key, r_new ->> v_key);
        end if;
      end loop;

      v_changed_parts := array_remove(v_changed_parts, null);

      if v_lead is null then
        if array_length(v_changed_parts, 1) is null then
          return coalesce(NEW, OLD);
        end if;
        -- Records with a detail panel get their context from the panel they
        -- are read in. These four have no panel of their own, so the entry
        -- has to say which employee / role / discount it is about.
        v_description := initcap(replace(v_record_type, '_', ' '))
                         || case when v_record_type in (
                                   'employee','role','discount','overhead_settings',
                                   'user','api_key','integration','oauth_token',
                                   'financial_period','approval_flow','automation',
                                   'crew','document_template','email_template','schedule')
                                 then ' ' || v_title else '' end
                         || ' updated — ' || array_to_string(v_changed_parts, '; ');
      elsif array_length(v_changed_parts, 1) is null then
        v_description := v_lead;
      else
        v_description := v_lead || '; ' || array_to_string(v_changed_parts, '; ');
      end if;
    end if;

  elsif TG_OP = 'DELETE' then
    v_action      := 'deleted';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;
  end if;

  -- audit_log.org_id is NOT NULL. A row that has no org yet (a profile
  -- created mid-signup, a client-credentials token) must not turn its
  -- own INSERT into a constraint failure — skip the entry instead.
  if v_org_id is null then
    return coalesce(NEW, OLD);
  end if;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, old_value, new_value
  ) values (
    v_org_id, v_user_id, v_record_type, v_record_id, v_action,
    v_user_name, v_description, v_old_val, v_new_val
  );

  return coalesce(NEW, OLD);
end;
$function$;

-- ── 3. Backfill the orphaned record_types so existing history becomes visible ─

-- Products: 'product_item' -> 'product'. record_id already points at the
-- product, so only the label was wrong.
UPDATE public.audit_log
   SET record_type = 'product'
 WHERE record_type = 'product_item';

-- Two much older strays from before the mapping existed.
UPDATE public.audit_log SET record_type = 'job_photo' WHERE record_type = 'photo_jobs';
UPDATE public.audit_log SET record_type = 'po'        WHERE record_type = 'purchase_order';

-- Change orders: repoint onto the project that owns them. record_id changes
-- here, which is the only way these entries can ever be displayed; the CO is
-- still named in the description.
UPDATE public.audit_log a
   SET record_type = 'project',
       record_id   = co.project_id
  FROM public.project_change_orders co
 WHERE a.record_type = 'project_change_orders'
   AND a.record_id = co.id
   AND co.project_id IS NOT NULL;

-- Anything that could not be repointed (a change order since hard-deleted)
-- stays as-is rather than being silently dropped.

-- ── 4. Audit the schedule definitions ────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_crm_schedules_audit ON public.crm_schedules;
CREATE TRIGGER trg_crm_schedules_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.crm_schedules
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
