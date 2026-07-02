-- Fix two audit-trail bugs surfaced by portal-created tickets:
-- 1. crm_tickets has no name/title/display_name column, so the generic v_title
--    fallback used the record's own UUID, e.g. "Ticket created: 3aea7974-...".
--    Give crm_tickets a subject-based title like the other record types.
-- 2. Portal writes go through the service-role client, which has no auth.uid(),
--    so the actor lookup against `profiles` always misses and the trigger fell
--    back to the literal 'system'. When the record is client-linked (tickets,
--    jobs, invoices, estimates), attribute the change to that client instead.
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
BEGIN
  r_old := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END;
  r_new := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END;

  v_org_id    := COALESCE((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);
  v_record_id := COALESCE((r_new ->> 'id')::uuid,     (r_old ->> 'id')::uuid);

  v_record_type := CASE TG_TABLE_NAME
    WHEN 'requisitions'         THEN 'requisition'
    WHEN 'purchase_orders'      THEN 'purchase_order'
    WHEN 'work_orders'          THEN 'work_order'
    WHEN 'assets'               THEN 'asset'
    WHEN 'vehicles'             THEN 'vehicle'
    WHEN 'parts'                THEN 'part'
    WHEN 'product_items'        THEN 'product'
    WHEN 'projects'             THEN 'project'
    WHEN 'maintenance_requests' THEN 'request'
    WHEN 'vendors'              THEN 'vendor'
    WHEN 'pm_schedules'         THEN 'pm_schedule'
    WHEN 'meter_readings'       THEN 'meter_reading'
    WHEN 'clients'              THEN 'client'
    WHEN 'crm_tickets'          THEN 'ticket'
    WHEN 'crm_jobs'             THEN 'job'
    WHEN 'crm_invoices'         THEN 'invoice'
    WHEN 'crm_estimates'        THEN 'estimate'
    ELSE TG_TABLE_NAME
  END;

  v_title := CASE TG_TABLE_NAME
    WHEN 'requisitions'    THEN COALESCE(r_new ->> 'requisition_number', r_old ->> 'requisition_number', '')
    WHEN 'purchase_orders' THEN COALESCE(r_new ->> 'po_number',          r_old ->> 'po_number',          '')
    WHEN 'work_orders'     THEN COALESCE(r_new ->> 'work_order_number',  r_old ->> 'work_order_number',  '')
    WHEN 'crm_invoices'    THEN 'Invoice #' || COALESCE(r_new ->> 'invoice_number', r_old ->> 'invoice_number', '')
    WHEN 'crm_tickets'     THEN COALESCE(NULLIF(r_new ->> 'subject', ''), NULLIF(r_old ->> 'subject', ''), 'Ticket #' || COALESCE(r_new ->> 'ticket_number', r_old ->> 'ticket_number', ''))
    WHEN 'vehicles'        THEN COALESCE(
      (r_new ->> 'year') || ' ' || (r_new ->> 'make') || ' ' || (r_new ->> 'model'),
      (r_old ->> 'year') || ' ' || (r_old ->> 'make') || ' ' || (r_old ->> 'model'), '')
    WHEN 'meter_readings'  THEN 'Reading ' || COALESCE(r_new ->> 'value', r_old ->> 'value', '')
    ELSE COALESCE(r_new ->> 'name', r_old ->> 'name', r_new ->> 'title', r_old ->> 'title',
                  r_new ->> 'display_name', r_old ->> 'display_name', v_record_id::text)
  END;

  BEGIN
    SELECT id, COALESCE(full_name, email, id::text)
    INTO v_user_id, v_user_name
    FROM profiles
    WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id   := NULL;
    v_user_name := NULL;
  END;

  -- No resolvable org user (e.g. a client-portal write via the service role,
  -- which has no auth.uid()). If the record is tied to a client, attribute
  -- the change to that client instead of silently defaulting to "system".
  IF v_user_name IS NULL THEN
    BEGIN
      SELECT display_name INTO v_user_name
      FROM clients
      WHERE id = COALESCE((r_new ->> 'client_id')::uuid, (r_old ->> 'client_id')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_user_name := NULL;
    END;
  END IF;

  v_user_name := COALESCE(v_user_name, 'system');

  IF TG_OP = 'INSERT' THEN
    v_action      := 'created';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' created: ' || v_title;

  ELSIF TG_OP = 'UPDATE' THEN

    IF (r_old ->> 'deleted_at') IS NULL AND (r_new ->> 'deleted_at') IS NOT NULL THEN
      v_action      := 'deleted';
      v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;

    ELSIF TG_TABLE_NAME = 'parts'
      AND (r_old ->> 'quantity_on_hand') IS DISTINCT FROM (r_new ->> 'quantity_on_hand')
    THEN
      v_action      := 'qty_adjusted';
      v_description := v_title || ': qty ' || COALESCE(r_old ->> 'quantity_on_hand', '?')
                       || ' → ' || COALESCE(r_new ->> 'quantity_on_hand', '?');

    ELSIF (r_old ->> 'status') IS DISTINCT FROM (r_new ->> 'status')
      AND (r_old ->> 'status') IS NOT NULL
    THEN
      v_action      := 'status_changed';
      v_description := v_title || ' status: '
                       || COALESCE(r_old ->> 'status', '?')
                       || ' → '
                       || COALESCE(r_new ->> 'status', '?');
      v_old_val     := r_old ->> 'status';
      v_new_val     := r_new ->> 'status';

    ELSE
      v_skip_keys := ARRAY[
        'updated_at','created_at','org_id','id','created_by',
        'balance_outstanding_cents','balance_uninvoiced_cents',
        'balance_credits_cents','balance_prepay_cents',
        'subtotal_cents','tax_cents','total_cents','balance_cents',
        'amount_paid_cents','deleted_at'
      ];
      v_changed_parts := ARRAY[]::text[];

      FOR v_key IN SELECT jsonb_object_keys(r_new) LOOP
        CONTINUE WHEN v_key = ANY(v_skip_keys);
        IF (r_old ->> v_key) IS DISTINCT FROM (r_new ->> v_key) THEN
          v_old_field := COALESCE(r_old ->> v_key, 'blank');
          v_new_field := COALESCE(r_new ->> v_key, 'blank');
          IF length(v_old_field) > 40 THEN v_old_field := left(v_old_field, 40) || '…'; END IF;
          IF length(v_new_field) > 40 THEN v_new_field := left(v_new_field, 40) || '…'; END IF;
          v_changed_parts := v_changed_parts ||
            (replace(v_key, '_', ' ') || ': ' || v_old_field || ' → ' || v_new_field);
        END IF;
      END LOOP;

      v_action := 'updated';
      IF array_length(v_changed_parts, 1) IS NULL THEN
        RETURN COALESCE(NEW, OLD);
      ELSIF array_length(v_changed_parts, 1) = 1 THEN
        v_description := initcap(replace(v_record_type, '_', ' ')) || ' updated — '
                         || v_changed_parts[1];
      ELSE
        v_description := initcap(replace(v_record_type, '_', ' ')) || ' updated — '
                         || array_to_string(v_changed_parts, '; ');
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_action      := 'deleted';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;
  END IF;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, old_value, new_value
  ) VALUES (
    v_org_id, v_user_id, v_record_type, v_record_id, v_action,
    v_user_name, v_description, v_old_val, v_new_val
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
