-- requisition_line_items/po_line_items had zero audit trail — no trigger of
-- any kind logs their creation, edits, or (hard) deletion, unlike almost
-- every other table in the app. Line items don't have their own detail page
-- to show a trail on, so entries are attributed to the PARENT record
-- (record_type = 'requisition'/'po', record_id = requisition_id/po_id) —
-- both RequisitionDetailPanel and PODetailPanel already render
-- <AuditTrailTab recordType="requisition|po" recordId={...} />, so these
-- entries surface there automatically, interleaved with the parent's own
-- history, with no UI changes needed.

CREATE OR REPLACE FUNCTION public.fn_audit_log_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_type   text;
  v_parent_id     uuid;
  v_org_id        uuid;
  v_user_id       uuid;
  v_user_name     text;
  v_name          text;
  r_old           jsonb;
  r_new           jsonb;
BEGIN
  r_old := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END;
  r_new := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END;

  v_org_id := COALESCE((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);
  v_name   := NULLIF(COALESCE(r_new ->> 'product_item_name', r_old ->> 'product_item_name'), '');
  v_name   := COALESCE(v_name, 'Line item');

  IF TG_TABLE_NAME = 'requisition_line_items' THEN
    v_record_type := 'requisition';
    v_parent_id := COALESCE((r_new ->> 'requisition_id')::uuid, (r_old ->> 'requisition_id')::uuid);
  ELSE
    v_record_type := 'po';
    v_parent_id := COALESCE((r_new ->> 'po_id')::uuid, (r_old ->> 'po_id')::uuid);
  END IF;

  v_user_id := auth.uid();
  SELECT name INTO v_user_name FROM public.profiles WHERE id = v_user_id LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description)
    VALUES (
      v_org_id, v_user_id, v_record_type, v_parent_id, 'created', v_user_name,
      v_name || ': line item added (qty ' || (r_new ->> 'quantity') || ' @ $' ||
        to_char(((r_new ->> 'unit_cost')::numeric) / 100, 'FM999999990.00') || ')'
    );

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description)
    VALUES (
      v_org_id, v_user_id, v_record_type, v_parent_id, 'deleted', v_user_name,
      v_name || ': line item removed (was qty ' || (r_old ->> 'quantity') || ' @ $' ||
        to_char(((r_old ->> 'unit_cost')::numeric) / 100, 'FM999999990.00') || ')'
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF (r_old ->> 'quantity') IS DISTINCT FROM (r_new ->> 'quantity') THEN
      INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description, field_changed, old_value, new_value)
      VALUES (v_org_id, v_user_id, v_record_type, v_parent_id, 'qty_adjusted', v_user_name,
        v_name || ': quantity changed', 'quantity', r_old ->> 'quantity', r_new ->> 'quantity');
    END IF;

    IF (r_old ->> 'unit_cost') IS DISTINCT FROM (r_new ->> 'unit_cost') THEN
      INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description, field_changed, old_value, new_value)
      VALUES (v_org_id, v_user_id, v_record_type, v_parent_id, 'price_updated', v_user_name,
        v_name || ': unit cost changed', 'unit_cost',
        '$' || to_char(((r_old ->> 'unit_cost')::numeric) / 100, 'FM999999990.00'),
        '$' || to_char(((r_new ->> 'unit_cost')::numeric) / 100, 'FM999999990.00'));
    END IF;

    IF (r_old ->> 'project_id') IS DISTINCT FROM (r_new ->> 'project_id') THEN
      INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description, field_changed, old_value, new_value)
      VALUES (v_org_id, v_user_id, v_record_type, v_parent_id, 'updated', v_user_name,
        v_name || ': project assignment changed', 'project_id', r_old ->> 'project_id', r_new ->> 'project_id');
    END IF;

    -- po_line_items only — requisition_line_items has no per-line taxable flag.
    IF TG_TABLE_NAME = 'po_line_items' AND (r_old ->> 'taxable') IS DISTINCT FROM (r_new ->> 'taxable') THEN
      INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description, field_changed, old_value, new_value)
      VALUES (v_org_id, v_user_id, v_record_type, v_parent_id, 'updated', v_user_name,
        v_name || ': taxable flag changed', 'taxable', r_old ->> 'taxable', r_new ->> 'taxable');
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_requisition_line_items ON public.requisition_line_items;
CREATE TRIGGER trg_audit_log_requisition_line_items
  AFTER INSERT OR UPDATE OR DELETE ON public.requisition_line_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_line_item();

DROP TRIGGER IF EXISTS trg_audit_log_po_line_items ON public.po_line_items;
CREATE TRIGGER trg_audit_log_po_line_items
  AFTER INSERT OR UPDATE OR DELETE ON public.po_line_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_line_item();
