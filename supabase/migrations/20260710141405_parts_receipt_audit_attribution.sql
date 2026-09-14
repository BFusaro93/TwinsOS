-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: parts quantity changes from a goods receipt were logged as a generic
-- "quantity adjusted" entry attributed only to the receiving user, with no
-- reference to the PO/receipt that actually drove the change.
--
-- 1. fn_audit_log(): the generic parts "qty_adjusted" branch now skips itself
--    when the update runs inside receive_part_quantity() (flagged via a
--    transaction-local setting), so it doesn't shadow the attributed entry.
-- 2. receive_part_quantity(): new SECURITY DEFINER RPC that performs the
--    quantity_on_hand/cost_layers/unit_cost update for a goods receipt and
--    writes a single audit_log row with action 'received' referencing the
--    PO number.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Allow 'received' as an audit_log action ─────────────────────────────────

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'created'::text, 'updated'::text, 'status_changed'::text, 'qty_adjusted'::text,
    'price_updated'::text, 'vendor_changed'::text, 'image_uploaded'::text,
    'deleted'::text, 'archived'::text, 'unarchived'::text, 'received'::text
  ]));

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

    -- 2. Parts quantity adjustment (manual edits only — receive_part_quantity()
    --    writes its own attributed audit entry and suppresses this one).
    ELSIF TG_TABLE_NAME = 'parts'
      AND (r_old ->> 'quantity_on_hand') IS DISTINCT FROM (r_new ->> 'quantity_on_hand')
      AND COALESCE(current_setting('app.suppress_parts_qty_audit', true), '') <> 'true'
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

-- ── receive_part_quantity(): attributed parts quantity update ──────────────
--
-- Runs the quantity_on_hand/cost_layers/unit_cost update for a maintenance
-- part received against a PO, inside the same transaction as a single
-- audit_log entry that names the PO — instead of the generic per-field
-- "quantity adjusted" entry the trigger would otherwise write.

CREATE OR REPLACE FUNCTION public.receive_part_quantity(
  p_org_id          uuid,
  p_part_id         uuid,
  p_quantity        integer,
  p_new_unit_cost   integer,
  p_new_cost_layers jsonb,
  p_po_number       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_user_name text;
  v_old_qty   integer;
  v_new_qty   integer;
  v_part_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL OR p_org_id != public.my_org_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Received quantity must be positive';
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
  v_new_qty := v_old_qty + p_quantity;

  -- Transaction-local: cleared automatically at commit, so it can never
  -- leak into an unrelated statement on this connection/pool session.
  PERFORM set_config('app.suppress_parts_qty_audit', 'true', true);

  UPDATE public.parts
  SET quantity_on_hand = v_new_qty,
      unit_cost         = p_new_unit_cost,
      cost_layers       = p_new_cost_layers
  WHERE id = p_part_id AND org_id = p_org_id;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    p_org_id, v_user_id, 'part', p_part_id, 'received',
    v_user_name,
    v_part_name || ': received ' || p_quantity || ' via PO ' || COALESCE(NULLIF(p_po_number, ''), '(unknown)'),
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
END;
$$;
