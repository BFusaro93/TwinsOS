-- ─────────────────────────────────────────────────────────────────────────────
-- Landscapt audit coverage + audit engine hardening
--
-- Two things happen here.
--
-- 1. ENGINE FIXES to fn_audit_log. Three structural defects have been the
--    source of most of the "fix_*_audit" migrations in this repo:
--
--    a) Only ONE change was recorded per UPDATE. The branch chain
--       (soft-delete / qty / status / archived / everything-else) is an
--       `elsif` cascade, so a save that changed status AND price logged the
--       status and silently dropped the price. Now the generic field diff
--       always runs and the specialised branch only decides the ACTION label
--       and the leading phrase; every other changed field is appended.
--
--    b) Attribution lied in two directions. With no auth.uid() the function
--       fell back to the row's created_by — which on an UPDATE names the
--       person who originally created the record, not whoever made the edit.
--       That fallback is now INSERT-only. The clients.display_name fallback
--       (which made background writes look like the customer did them) now
--       only applies when the writer really is a client-portal user.
--
--    c) Money detection was a hardcoded column-name list, so every new
--       money column printed raw cents as dollars until someone noticed.
--       `%_cents` already covers the convention; `%_bps` now renders as a
--       percentage, and raw UUID values are no longer dumped into
--       descriptions (they were previously either unreadable or skipped
--       outright, which hid assignee changes).
--
--    A global `app.suppress_audit` GUC is added for bulk/system routines,
--    alongside the existing `app.suppress_parts_qty_audit`.
--
-- 2. LANDSCAPT COVERAGE. 11 child tables and 4 settings tables that carry
--    money, labour hours, regulatory records or permissions had no audit
--    trail at all. Child tables roll their entries up to the parent record
--    (the crm_invoice_line_items → invoice pattern), so they appear in the
--    Audit Trail tab that already exists on that parent with no UI change.
--
-- Base body taken from the CURRENT live prod definition, not the migration
-- history — this function has drifted before.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Shared field-change formatter ─────────────────────────────────────────────
-- One place that decides how a changed column reads in a description. Money
-- detection used to be a hardcoded column-name list duplicated in two branches,
-- so every new money column printed raw cents as dollars until someone spotted
-- it in production. The `_cents` / `_bps` suffix conventions now carry it, and
-- UUID-valued columns report that they changed instead of dumping an unreadable
-- id (tables that denormalise a readable `*_name` alongside the id skip the id
-- outright and log the name instead).

CREATE OR REPLACE FUNCTION public.fn_audit_format_change(
  p_key text,
  p_old text,
  p_new text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
declare
  v_label text;
  v_old   text;
  v_new   text;
begin
  -- Foreign keys: say what changed, not which uuid it changed to.
  if p_key ~ '_ids?$' then
    return replace(regexp_replace(p_key, '_ids?$', ''), '_', ' ') || ' changed';
  end if;

  if p_key like '%\_cents' or p_key in (
    'unit_cost', 'price', 'contract_price', 'total_cost', 'purchase_price',
    'shipping_cost', 'subtotal', 'grand_total', 'sales_tax', 'discount_cost'
  ) then
    v_label := replace(regexp_replace(p_key, '_cents$', ''), '_', ' ');
    v_old   := '$' || to_char(coalesce(p_old::numeric, 0) / 100.0, 'FM999999990.00');
    v_new   := '$' || to_char(coalesce(p_new::numeric, 0) / 100.0, 'FM999999990.00');

  elsif p_key like '%\_bps' then
    v_label := replace(regexp_replace(p_key, '_bps$', ''), '_', ' ');
    v_old   := to_char(coalesce(p_old::numeric, 0) / 100.0, 'FM999999990.00') || '%';
    v_new   := to_char(coalesce(p_new::numeric, 0) / 100.0, 'FM999999990.00') || '%';

  else
    v_label := replace(p_key, '_', ' ');
    v_old   := coalesce(p_old, 'blank');
    v_new   := coalesce(p_new, 'blank');
    if length(v_old) > 40 then v_old := left(v_old, 40) || '…'; end if;
    if length(v_new) > 40 then v_new := left(v_new, 40) || '…'; end if;
  end if;

  return v_label || ': ' || v_old || ' → ' || v_new;
exception when others then
  -- A bad cast must never take down the write being audited.
  return replace(p_key, '_', ' ') || ' changed';
end;
$function$;

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
    'client_properties', 'client_contacts'
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
      else 'work_order'
    end;

    v_record_id := coalesce(
      (r_new ->> v_parent_fk)::uuid,
      (r_old ->> v_parent_fk)::uuid
    );

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
      else ''
    end;

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
          'contract_id','visit_id','project_id',
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
        'updated_at','created_at','org_id','id','created_by',
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
                         || case when v_record_type in ('employee','role','discount','overhead_settings')
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Attach triggers to the Landscapt tables that had no audit trail.
--
-- Child tables roll up onto the parent record, so their entries appear in the
-- Audit Trail tab that already exists on the Client / Job / Invoice / Estimate
-- / Contract detail panel with no UI change.
--
-- Several of these tables HARD delete (no deleted_at column): crm_job_services,
-- crm_crew_member_times, crm_payment_allocations. The DELETE trigger is the
-- only record that the row ever existed, which is exactly why they are here.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  audited_tables text[] := array[
    -- money
    'crm_payments', 'crm_payment_allocations', 'estimate_milestones',
    -- what gets billed on a job
    'crm_job_services', 'crm_job_products', 'crm_job_materials',
    -- labour hours (payroll)
    'crm_crew_member_times',
    -- regulatory: pesticide application records
    'crm_chemical_applications',
    -- contract scope
    'crm_contract_services',
    -- client records that drive pricing and billing delivery
    'client_properties', 'client_contacts',
    -- settings that silently change every downstream number
    'crm_employees', 'crm_roles', 'crm_discounts', 'crm_overhead_settings'
  ];
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_audit', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log()',
      'trg_' || t || '_audit', t
    );
  END LOOP;
END $$;
