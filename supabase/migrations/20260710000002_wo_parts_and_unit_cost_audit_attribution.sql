-- ─────────────────────────────────────────────────────────────────────────────
-- Follow-up to 20260710000001_parts_receipt_audit_attribution.sql.
--
-- 1. adjust_part_quantity(): parts consumed/returned on a Work Order had the
--    exact same problem as PO receiving — a plain UPDATE with no auth/org
--    check (a real cross-tenant gap, since it's SECURITY DEFINER) and no
--    reference to which WO drove the change. Now attributed and org-scoped.
-- 2. fn_audit_log() + receive_part_quantity(): a goods receipt that also
--    recalculates weighted-average unit_cost was producing a second, separate
--    "Unit Cost updated" audit row with no context. Folded into the single
--    'received' row instead.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── fn_audit_log(): also suppress the generic 'unit_cost' field-tracking
--    entry when receive_part_quantity() already covered it ────────────────────

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
  v_suppress_qty     boolean;
BEGIN
  r_old := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END;
  r_new := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END;

  v_org_id    := COALESCE((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);
  v_record_id := COALESCE((r_new ->> 'id')::uuid,     (r_old ->> 'id')::uuid);
  v_suppress_qty := COALESCE(current_setting('app.suppress_parts_qty_audit', true), '') = 'true';

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

    -- 2. Parts quantity adjustment (manual edits only — receive_part_quantity()/
    --    adjust_part_quantity() write their own attributed audit entry and
    --    suppress this one).
    ELSIF TG_TABLE_NAME = 'parts'
      AND (r_old ->> 'quantity_on_hand') IS DISTINCT FROM (r_new ->> 'quantity_on_hand')
      AND NOT v_suppress_qty
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
          -- unit_cost changes driven by receive_part_quantity() are folded into
          -- its own 'received' row instead of a separate generic entry here.
          AND NOT (TG_TABLE_NAME = 'parts' AND v_field = 'unit_cost' AND v_suppress_qty)
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

      IF NOT v_any_logged AND NOT v_suppress_qty THEN
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

-- ── receive_part_quantity(): fold a unit_cost change into the same 'received'
--    row instead of leaving branch 4 to write a second "Unit Cost updated" row ─

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
  v_user_id     uuid;
  v_user_name   text;
  v_old_qty     integer;
  v_new_qty     integer;
  v_old_cost    integer;
  v_part_name   text;
  v_description text;
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

  SELECT quantity_on_hand, unit_cost, name INTO v_old_qty, v_old_cost, v_part_name
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

  v_description := v_part_name || ': received ' || p_quantity || ' via PO ' ||
    COALESCE(NULLIF(p_po_number, ''), '(unknown)');
  IF p_new_unit_cost IS DISTINCT FROM v_old_cost THEN
    v_description := v_description || ' (unit cost $' ||
      round(v_old_cost::numeric / 100, 2) || ' → $' || round(p_new_unit_cost::numeric / 100, 2) || ')';
  END IF;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    p_org_id, v_user_id, 'part', p_part_id, 'received',
    v_user_name, v_description,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
END;
$$;

-- ── adjust_part_quantity(): attribute WO parts consumption/return, and close
--    a real cross-tenant gap (SECURITY DEFINER with no org check at all) ──────
--
-- The new signature adds a parameter, so CREATE OR REPLACE below creates an
-- overload rather than replacing the old (uuid, integer) function — drop the
-- old one explicitly so the unchecked version can't be called anymore.

DROP FUNCTION IF EXISTS public.adjust_part_quantity(uuid, integer);

CREATE OR REPLACE FUNCTION public.adjust_part_quantity(
  p_part_id         uuid,
  p_delta           integer,
  p_work_order_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_user_name   text;
  v_org_id      uuid;
  v_old_qty     integer;
  v_new_qty     integer;
  v_part_name   text;
  v_wo_number   text;
  v_description text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT name INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id
    LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  SELECT quantity_on_hand, name, org_id INTO v_old_qty, v_part_name, v_org_id
    FROM public.parts
    WHERE id = p_part_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN; -- preserve prior no-op behavior for a missing/deleted part
  END IF;

  IF v_org_id != public.my_org_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_new_qty := GREATEST(0, v_old_qty + p_delta);
  IF v_new_qty = v_old_qty THEN
    RETURN;
  END IF;

  PERFORM set_config('app.suppress_parts_qty_audit', 'true', true);

  UPDATE public.parts
  SET quantity_on_hand = v_new_qty,
      updated_at = now()
  WHERE id = p_part_id;

  IF p_work_order_id IS NOT NULL THEN
    SELECT work_order_number INTO v_wo_number
      FROM public.work_orders
      WHERE id = p_work_order_id;
  END IF;

  v_description := v_part_name || ': ' ||
    CASE
      WHEN v_wo_number IS NOT NULL AND p_delta < 0 THEN 'used ' || abs(p_delta) || ' on ' || v_wo_number
      WHEN v_wo_number IS NOT NULL AND p_delta > 0 THEN 'returned ' || p_delta || ' from ' || v_wo_number
      ELSE 'quantity adjusted'
    END;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
    v_user_name, v_description,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
END;
$$;
