-- The generic per-field diff builder in fn_audit_log dumped the four raw
-- discount columns verbatim, e.g.:
--   "discount type: blank → percent; discount cents: 0 → 50;
--    discount value: blank → 500; applied discount id: blank → 879f347c-..."
-- That's unreadable — cents aren't dollar-formatted, "discount value" is
-- basis points with no unit shown, and the preset is a raw UUID. Collapse
-- all four into one friendly line, e.g. "discount: $0.50 (5.00% — Cash
-- discount)", in both the line-item branch and the header/document branch.

create or replace function public.fn_audit_log()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_record_type   text;
  v_record_id     uuid;
  v_org_id        uuid;
  v_action        text;
  v_description   text;
  v_old_val       text;
  v_new_val       text;
  v_user_id       uuid;
  v_user_name     text;
  r_old           jsonb;
  r_new           jsonb;
  v_title         text;
  v_key           text;
  v_changed_parts text[];
  v_skip_keys     text[];
  v_old_field     text;
  v_new_field     text;
  v_disc_cents    integer;
  v_disc_type     text;
  v_disc_value    integer;
  v_disc_applied  uuid;
  v_disc_name     text;
  v_disc_note     text;
begin
  r_old := case when TG_OP = 'INSERT' then '{}'::jsonb else row_to_json(OLD)::jsonb end;
  r_new := case when TG_OP = 'DELETE' then '{}'::jsonb else row_to_json(NEW)::jsonb end;

  v_org_id := coalesce((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);

  begin
    select id, coalesce(name, email, id::text)
    into v_user_id, v_user_name
    from profiles
    where id = auth.uid();
  exception when others then
    v_user_id   := null;
    v_user_name := null;
  end;

  if v_user_name is null then
    begin
      select id, coalesce(name, email, id::text)
      into v_user_id, v_user_name
      from profiles
      where id = coalesce((r_new ->> 'created_by')::uuid, (r_old ->> 'created_by')::uuid);
    exception when others then
      v_user_id   := null;
      v_user_name := null;
    end;
  end if;

  if v_user_name is null then
    begin
      select display_name into v_user_name
      from clients
      where id = coalesce((r_new ->> 'client_id')::uuid, (r_old ->> 'client_id')::uuid);
    exception when others then
      v_user_name := null;
    end;
  end if;

  v_user_name := coalesce(v_user_name, 'system');

  -- ── Line items on invoices/estimates: log against the PARENT document ──────
  if TG_TABLE_NAME in ('crm_invoice_line_items', 'estimate_line_items') then
    v_record_type := case TG_TABLE_NAME
      when 'crm_invoice_line_items' then 'invoice'
      else 'estimate'
    end;
    v_record_id := case TG_TABLE_NAME
      when 'crm_invoice_line_items' then coalesce((r_new ->> 'invoice_id')::uuid, (r_old ->> 'invoice_id')::uuid)
      else coalesce((r_new ->> 'estimate_id')::uuid, (r_old ->> 'estimate_id')::uuid)
    end;
    if v_org_id is null then
      v_org_id := case TG_TABLE_NAME
        when 'crm_invoice_line_items' then (select org_id from crm_invoices where id = v_record_id)
        else (select org_id from estimates where id = v_record_id)
      end;
    end if;

    v_title := case TG_TABLE_NAME
      when 'crm_invoice_line_items' then coalesce(
        nullif(r_new ->> 'name', ''), nullif(r_old ->> 'name', ''),
        nullif(r_new ->> 'description', ''), nullif(r_old ->> 'description', ''),
        'line item')
      else coalesce(nullif(r_new ->> 'service_name', ''), nullif(r_old ->> 'service_name', ''), 'line item')
    end;

    if TG_OP = 'INSERT' then
      v_action      := 'created';
      v_description := 'Line item added: ' || v_title;

    elsif TG_OP = 'DELETE' then
      v_action      := 'deleted';
      v_description := 'Line item removed: ' || v_title;

    else -- UPDATE
      if (r_old ->> 'deleted_at') is null and (r_new ->> 'deleted_at') is not null then
        v_action      := 'deleted';
        v_description := 'Line item removed: ' || v_title;
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
          'updated_at','created_at','org_id','id','invoice_id','estimate_id',
          'sort_order','total_cents','total_cost_cents','total_budgeted_hours',
          'margin_bps','markup_bps','deleted_at',
          'discount_cents','discount_type','discount_value','applied_discount_id'
        ];

        for v_key in select jsonb_object_keys(r_new) loop
          continue when v_key = any(v_skip_keys);
          if (r_old ->> v_key) is distinct from (r_new ->> v_key) then
            v_old_field := coalesce(r_old ->> v_key, 'blank');
            v_new_field := coalesce(r_new ->> v_key, 'blank');
            if length(v_old_field) > 40 then v_old_field := left(v_old_field, 40) || '…'; end if;
            if length(v_new_field) > 40 then v_new_field := left(v_new_field, 40) || '…'; end if;
            v_changed_parts := v_changed_parts ||
              (replace(v_key, '_', ' ') || ': ' || v_old_field || ' → ' || v_new_field);
          end if;
        end loop;

        if array_length(v_changed_parts, 1) is null then
          return coalesce(NEW, OLD);
        end if;

        v_action      := 'updated';
        v_description := 'Line item ' || v_title || ' updated — ' || array_to_string(v_changed_parts, '; ');
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

  -- ── Every other audited table ───────────────────────────────────────────────
  v_record_id := coalesce((r_new ->> 'id')::uuid, (r_old ->> 'id')::uuid);

  v_record_type := case TG_TABLE_NAME
    when 'requisitions'         then 'requisition'
    when 'purchase_orders'      then 'po'
    when 'work_orders'          then 'work_order'
    when 'assets'               then 'asset'
    when 'vehicles'              then 'vehicle'
    when 'parts'                 then 'part'
    when 'product_items'         then 'product'
    when 'projects'               then 'project'
    when 'maintenance_requests'  then 'request'
    when 'vendors'                then 'vendor'
    when 'pm_schedules'           then 'pm_schedule'
    when 'meter_readings'         then 'meter_reading'
    when 'goods_receipts'         then 'receiving'
    when 'damage_cases'           then 'damage_case'
    when 'photo_jobs'             then 'job_photo'
    when 'clients'                then 'client'
    when 'crm_tickets'            then 'ticket'
    when 'crm_jobs'               then 'job'
    when 'crm_invoices'           then 'invoice'
    when 'estimates'              then 'estimate'
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
    when 'vehicles'        then coalesce(
      nullif(trim(coalesce(r_new ->> 'year','') || ' ' || coalesce(r_new ->> 'make','') || ' ' || coalesce(r_new ->> 'model','')), ''),
      nullif(trim(coalesce(r_old ->> 'year','') || ' ' || coalesce(r_old ->> 'make','') || ' ' || coalesce(r_old ->> 'model','')), ''),
      '')
    when 'meter_readings'  then 'Reading ' || coalesce(r_new ->> 'value', r_old ->> 'value', '')
    else coalesce(r_new ->> 'name', r_old ->> 'name', r_new ->> 'title', r_old ->> 'title',
                  r_new ->> 'display_name', r_old ->> 'display_name', v_record_id::text)
  end;

  if TG_OP = 'INSERT' then
    v_action      := 'created';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' created: ' || v_title;

  elsif TG_OP = 'UPDATE' then

    if (r_old ->> 'deleted_at') is null and (r_new ->> 'deleted_at') is not null then
      v_action      := 'deleted';
      v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;

    elsif TG_TABLE_NAME = 'parts'
      and (r_old ->> 'quantity_on_hand') is distinct from (r_new ->> 'quantity_on_hand')
    then
      v_action      := 'qty_adjusted';
      v_description := v_title || ': qty ' || coalesce(r_old ->> 'quantity_on_hand', '?')
                       || ' → ' || coalesce(r_new ->> 'quantity_on_hand', '?');

    elsif (r_old ->> 'status') is distinct from (r_new ->> 'status')
      and (r_old ->> 'status') is not null
    then
      v_action      := 'status_changed';
      v_description := v_title || ' status: '
                       || coalesce(r_old ->> 'status', '?')
                       || ' → '
                       || coalesce(r_new ->> 'status', '?');
      v_old_val     := r_old ->> 'status';
      v_new_val     := r_new ->> 'status';

    elsif (r_old ->> 'is_archived') is distinct from (r_new ->> 'is_archived')
      and (r_new ->> 'is_archived') is not null
    then
      v_action      := case when (r_new ->> 'is_archived') = 'true' then 'archived' else 'unarchived' end;
      v_description := v_title || case when (r_new ->> 'is_archived') = 'true' then ' archived' else ' unarchived' end;
      v_old_val     := r_old ->> 'is_archived';
      v_new_val     := r_new ->> 'is_archived';

    else
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

      v_skip_keys := array[
        'updated_at','created_at','org_id','id','created_by',
        'balance_outstanding_cents','balance_uninvoiced_cents',
        'balance_credits_cents','balance_prepay_cents',
        'subtotal_cents','tax_cents','total_cents','balance_cents',
        'amount_paid_cents','deleted_at',
        'discount_cents','discount_type','discount_value','applied_discount_id'
      ];

      for v_key in select jsonb_object_keys(r_new) loop
        continue when v_key = any(v_skip_keys);
        if (r_old ->> v_key) is distinct from (r_new ->> v_key) then
          v_old_field := coalesce(r_old ->> v_key, 'blank');
          v_new_field := coalesce(r_new ->> v_key, 'blank');
          if length(v_old_field) > 40 then v_old_field := left(v_old_field, 40) || '…'; end if;
          if length(v_new_field) > 40 then v_new_field := left(v_new_field, 40) || '…'; end if;
          v_changed_parts := v_changed_parts ||
            (replace(v_key, '_', ' ') || ': ' || v_old_field || ' → ' || v_new_field);
        end if;
      end loop;

      v_action := 'updated';
      if array_length(v_changed_parts, 1) is null then
        return coalesce(NEW, OLD);
      elsif array_length(v_changed_parts, 1) = 1 then
        v_description := initcap(replace(v_record_type, '_', ' ')) || ' updated — '
                         || v_changed_parts[1];
      else
        v_description := initcap(replace(v_record_type, '_', ' ')) || ' updated — '
                         || array_to_string(v_changed_parts, '; ');
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
$$;
