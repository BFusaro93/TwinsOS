-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: audit_triggers
-- Adds a generic PL/pgSQL trigger function that writes to audit_log after
-- every INSERT or meaningful UPDATE on the key business tables.
--
-- Why a trigger instead of client-side inserts?
--   The audit_log table is intentionally write-protected for browser users
--   (service_insert_audit_log policy requires service role). A SECURITY DEFINER
--   trigger function runs as the function owner and bypasses that restriction,
--   ensuring every mutation is audited regardless of how it was made.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Trigger function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_type  text;
  v_record_id    uuid;
  v_org_id       uuid;
  v_action       text;
  v_description  text;
  v_old_val      text;
  v_new_val      text;
  v_user_id      uuid;
  v_user_name    text;
  r_old          jsonb;
  r_new          jsonb;
  v_title        text;
BEGIN
  -- Represent OLD and NEW as jsonb for safe, generic column access.
  -- INSERT has no OLD; DELETE has no NEW.
  r_old := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END;
  r_new := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END;

  -- Resolve org and record identity
  v_org_id    := COALESCE((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);
  v_record_id := COALESCE((r_new ->> 'id')::uuid,     (r_old ->> 'id')::uuid);

  -- Map table name → audit record_type label
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
    ELSE TG_TABLE_NAME
  END;

  -- Derive a human-readable display title for the description string.
  -- Fall through to generic name/title column, then fall back to record_id.
  v_title := CASE TG_TABLE_NAME
    WHEN 'requisitions'    THEN
      COALESCE(r_new ->> 'requisition_number', r_old ->> 'requisition_number', '')
    WHEN 'purchase_orders' THEN
      COALESCE(r_new ->> 'po_number',          r_old ->> 'po_number',          '')
    WHEN 'work_orders'     THEN
      COALESCE(r_new ->> 'work_order_number',  r_old ->> 'work_order_number',  '')
    WHEN 'vehicles'        THEN
      COALESCE(
        (r_new ->> 'year') || ' ' || (r_new ->> 'make') || ' ' || (r_new ->> 'model'),
        (r_old ->> 'year') || ' ' || (r_old ->> 'make') || ' ' || (r_old ->> 'model'),
        ''
      )
    WHEN 'meter_readings'  THEN
      'Reading ' || COALESCE(r_new ->> 'value', r_old ->> 'value', '')
    ELSE
      -- Most tables use either "name" or "title"
      COALESCE(
        r_new ->> 'name',  r_old ->> 'name',
        r_new ->> 'title', r_old ->> 'title',
        v_record_id::text
      )
  END;

  -- Look up the current user's display name.
  -- auth.uid() is available within a database session opened via Supabase Auth.
  -- Falls back to 'System' for service-role or background connections.
  v_user_id := auth.uid();
  SELECT name INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id
    LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  -- ── Classify the action ────────────────────────────────────────────────────

  IF TG_OP = 'INSERT' THEN
    v_action      := 'created';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' created: ' || v_title;

  ELSIF TG_OP = 'UPDATE' THEN

    -- 1. Soft-delete: deleted_at transitions NULL → non-NULL
    IF (r_old ->> 'deleted_at') IS NULL AND (r_new ->> 'deleted_at') IS NOT NULL THEN
      v_action      := 'deleted';
      v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;

    -- 2. Parts quantity adjustment
    ELSIF TG_TABLE_NAME = 'parts'
      AND (r_old ->> 'quantity_on_hand') IS DISTINCT FROM (r_new ->> 'quantity_on_hand')
    THEN
      v_action      := 'qty_adjusted';
      v_description := v_title
                       || ': qty ' || COALESCE(r_old ->> 'quantity_on_hand', '?')
                       || ' → '   || COALESCE(r_new ->> 'quantity_on_hand', '?');

    -- 3. Status change (any table with a "status" column)
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

    -- 4. Generic field update
    ELSE
      v_action      := 'updated';
      v_description := initcap(replace(v_record_type, '_', ' ')) || ' updated: ' || v_title;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    -- Hard deletes are not used by the application (soft-delete pattern),
    -- but this branch handles any accidental or administrative hard deletes.
    v_action      := 'deleted';
    v_description := initcap(replace(v_record_type, '_', ' ')) || ' deleted: ' || v_title;

  END IF;

  INSERT INTO public.audit_log (
    org_id,
    created_by,
    record_type,
    record_id,
    action,
    changed_by_name,
    description,
    old_value,
    new_value
  ) VALUES (
    v_org_id,
    v_user_id,
    v_record_type,
    v_record_id,
    v_action,
    v_user_name,
    v_description,
    v_old_val,
    v_new_val
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ── Attach triggers to all audited tables ─────────────────────────────────────
-- Using AFTER triggers so NEW/OLD reflect the committed row values.

CREATE TRIGGER trg_audit_requisitions
  AFTER INSERT OR UPDATE OR DELETE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_purchase_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_work_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_assets
  AFTER INSERT OR UPDATE OR DELETE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_vehicles
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_parts
  AFTER INSERT OR UPDATE OR DELETE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_product_items
  AFTER INSERT OR UPDATE OR DELETE ON public.product_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_maintenance_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_vendors
  AFTER INSERT OR UPDATE OR DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_pm_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.pm_schedules
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_audit_meter_readings
  AFTER INSERT OR UPDATE OR DELETE ON public.meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();


-- ── Enable Realtime on key tables ─────────────────────────────────────────────
-- Required for supabase.channel() postgres_changes subscriptions to work.

ALTER PUBLICATION supabase_realtime ADD TABLE public.requisitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.parts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_readings;
