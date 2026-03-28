-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: receiving_audit_and_parts_tracking
-- 1. Adds audit trigger on goods_receipts so receiving has an audit trail
-- 2. Updates fn_audit_log() to map goods_receipts → 'receiving' and adds
--    field-level tracking for goods_receipts and expands parts tracked fields
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Update fn_audit_log to handle goods_receipts + expand parts fields ──────

CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_type      text;
  v_record_id        uuid;
  v_org_id           uuid;
  v_user_id          uuid;
  v_user_name        text;
  r_old              jsonb;
  r_new              jsonb;
  v_title            text;
  v_field            text;
  v_fields           text[];
  v_any_logged       boolean := false;
BEGIN
  r_old := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END;
  r_new := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END;

  v_org_id    := COALESCE((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);
  v_record_id := COALESCE((r_new ->> 'id')::uuid,     (r_old ->> 'id')::uuid);

  -- Map table name → audit record_type label
  v_record_type := CASE TG_TABLE_NAME
    WHEN 'requisitions'         THEN 'requisition'
    WHEN 'purchase_orders'      THEN 'po'
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
    WHEN 'goods_receipts'       THEN 'receiving'
    ELSE TG_TABLE_NAME
  END;

  -- Derive a display title for descriptions.
  v_title := CASE TG_TABLE_NAME
    WHEN 'requisitions'    THEN
      COALESCE(r_new ->> 'requisition_number', r_old ->> 'requisition_number', '')
    WHEN 'purchase_orders' THEN
      COALESCE(r_new ->> 'po_number', r_old ->> 'po_number', '')
    WHEN 'work_orders'     THEN
      COALESCE(r_new ->> 'work_order_number', r_old ->> 'work_order_number', '')
    WHEN 'goods_receipts'  THEN
      COALESCE(r_new ->> 'receipt_number', r_old ->> 'receipt_number', '')
    WHEN 'vehicles'        THEN
      COALESCE(
        NULLIF(TRIM(
          COALESCE(r_new ->> 'year', '') || ' ' ||
          COALESCE(r_new ->> 'make', '') || ' ' ||
          COALESCE(r_new ->> 'model', '')
        ), '  '),
        NULLIF(TRIM(
          COALESCE(r_old ->> 'year', '') || ' ' ||
          COALESCE(r_old ->> 'make', '') || ' ' ||
          COALESCE(r_old ->> 'model', '')
        ), '  '),
        ''
      )
    WHEN 'meter_readings'  THEN
      'Reading ' || COALESCE(r_new ->> 'value', r_old ->> 'value', '')
    ELSE
      COALESCE(
        r_new ->> 'name',  r_old ->> 'name',
        r_new ->> 'title', r_old ->> 'title',
        v_record_id::text
      )
  END;

  v_user_id := auth.uid();
  SELECT name INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id
    LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  -- ── INSERT ──────────────────────────────────────────────────────────────

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (
      org_id, created_by, record_type, record_id, action, changed_by_name, description
    ) VALUES (
      v_org_id, v_user_id, v_record_type, v_record_id,
      'created', v_user_name,
      initcap(replace(v_record_type, '_', ' ')) || ' created: ' || v_title
    );

  -- ── UPDATE ──────────────────────────────────────────────────────────────

  ELSIF TG_OP = 'UPDATE' THEN

    -- 1. Soft-delete
    IF (r_old ->> 'deleted_at') IS NULL AND (r_new ->> 'deleted_at') IS NOT NULL THEN
      INSERT INTO public.audit_log (
        org_id, created_by, record_type, record_id, action, changed_by_name, description
      ) VALUES (
        v_org_id, v_user_id, v_record_type, v_record_id,
        'deleted', v_user_name,
        initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title
      );

    -- 2. Parts quantity adjustment
    ELSIF TG_TABLE_NAME = 'parts'
      AND (r_old ->> 'quantity_on_hand') IS DISTINCT FROM (r_new ->> 'quantity_on_hand')
    THEN
      INSERT INTO public.audit_log (
        org_id, created_by, record_type, record_id, action,
        changed_by_name, description, field_changed, old_value, new_value
      ) VALUES (
        v_org_id, v_user_id, v_record_type, v_record_id,
        'qty_adjusted', v_user_name,
        v_title || ': quantity adjusted',
        'quantity_on_hand',
        r_old ->> 'quantity_on_hand',
        r_new ->> 'quantity_on_hand'
      );

    -- 3. Status change
    ELSIF (r_old ->> 'status') IS DISTINCT FROM (r_new ->> 'status')
      AND (r_old ->> 'status') IS NOT NULL
    THEN
      INSERT INTO public.audit_log (
        org_id, created_by, record_type, record_id, action,
        changed_by_name, description, field_changed, old_value, new_value
      ) VALUES (
        v_org_id, v_user_id, v_record_type, v_record_id,
        'status_changed', v_user_name,
        v_title || ' status changed',
        'status',
        r_old ->> 'status',
        r_new ->> 'status'
      );

    -- 4. Field-level tracking
    ELSE
      v_fields := CASE TG_TABLE_NAME
        WHEN 'vehicles' THEN ARRAY[
          'name', 'asset_tag', 'equipment_number', 'make', 'model', 'year',
          'vin', 'license_plate', 'fuel_type', 'engine_model',
          'division', 'assigned_crew', 'location', 'barcode',
          'purchase_vendor_name', 'purchase_date', 'payment_method', 'finance_institution',
          'next_oil_change_due', 'next_oil_change_mileage', 'next_inspection_sticker_due',
          'notes', 'air_filter_part_number', 'oil_filter_part_number', 'spark_plug_part_number',
          'photo_url'
        ]
        WHEN 'assets' THEN ARRAY[
          'name', 'asset_tag', 'equipment_number', 'make', 'model', 'year',
          'serial_number', 'engine_serial_number', 'engine_model', 'manufacturer',
          'division', 'assigned_crew', 'location', 'barcode',
          'purchase_vendor_name', 'purchase_date', 'payment_method', 'finance_institution',
          'notes', 'air_filter_part_number', 'oil_filter_part_number', 'spark_plug_part_number',
          'photo_url'
        ]
        WHEN 'parts' THEN ARRAY[
          'name', 'part_number', 'category', 'description',
          'unit_cost', 'minimum_stock', 'vendor_name', 'vendor_id',
          'is_inventory', 'notes', 'picture_url', 'alternate_vendors'
        ]
        WHEN 'product_items' THEN ARRAY[
          'name', 'part_number', 'category', 'description',
          'unit_cost', 'price', 'vendor_name', 'vendor_id',
          'is_inventory', 'picture_url', 'alternate_vendors'
        ]
        WHEN 'work_orders' THEN ARRAY[
          'title', 'priority', 'assigned_to_name', 'due_date', 'category', 'description'
        ]
        WHEN 'requisitions' THEN ARRAY[
          'title', 'vendor_name', 'notes', 'grand_total'
        ]
        WHEN 'purchase_orders' THEN ARRAY[
          'vendor_name', 'notes', 'grand_total', 'invoice_number', 'po_date'
        ]
        WHEN 'vendors' THEN ARRAY[
          'name', 'contact_name', 'email', 'phone', 'address',
          'vendor_type', 'is_active', 'notes', 'website'
        ]
        WHEN 'projects' THEN ARRAY[
          'name', 'customer_name', 'address', 'start_date', 'end_date', 'notes'
        ]
        WHEN 'pm_schedules' THEN ARRAY[
          'title', 'frequency', 'next_due_date', 'last_completed_date', 'is_active', 'description'
        ]
        WHEN 'goods_receipts' THEN ARRAY[
          'receipt_number', 'vendor_name', 'po_number', 'received_by_name',
          'notes', 'subtotal', 'grand_total'
        ]
        ELSE ARRAY['name', 'title', 'description', 'notes']
      END;

      FOREACH v_field IN ARRAY v_fields LOOP
        IF (r_old ->> v_field) IS DISTINCT FROM (r_new ->> v_field)
          AND NOT ((r_old ->> v_field) IS NULL AND (r_new ->> v_field) IS NULL)
        THEN
          v_any_logged := true;
          INSERT INTO public.audit_log (
            org_id, created_by, record_type, record_id, action,
            changed_by_name, description, field_changed, old_value, new_value
          ) VALUES (
            v_org_id, v_user_id, v_record_type, v_record_id,
            'updated', v_user_name,
            initcap(replace(v_field, '_', ' ')) || ' updated',
            v_field,
            r_old ->> v_field,
            r_new ->> v_field
          );
        END IF;
      END LOOP;

      IF NOT v_any_logged THEN
        INSERT INTO public.audit_log (
          org_id, created_by, record_type, record_id, action, changed_by_name, description
        ) VALUES (
          v_org_id, v_user_id, v_record_type, v_record_id,
          'updated', v_user_name,
          initcap(replace(v_record_type, '_', ' ')) || ' updated: ' || v_title
        );
      END IF;
    END IF;

  -- ── DELETE ──────────────────────────────────────────────────────────────

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (
      org_id, created_by, record_type, record_id, action, changed_by_name, description
    ) VALUES (
      v_org_id, v_user_id, v_record_type, v_record_id,
      'deleted', v_user_name,
      initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Attach trigger to goods_receipts ────────────────────────────────────────

CREATE TRIGGER trg_audit_goods_receipts
  AFTER INSERT OR UPDATE OR DELETE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
