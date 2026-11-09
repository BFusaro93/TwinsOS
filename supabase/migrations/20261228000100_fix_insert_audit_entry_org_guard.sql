-- insert_audit_entry has raised "cannot cast type boolean to uuid" on EVERY call since
-- 20260928100000_null_org_guards_and_member_write_policies.sql, which wrote its org guard as
--   public._org_mismatch(p_org_id::uuid)::uuid
-- _org_mismatch() returns boolean, so the trailing ::uuid can never evaluate. The two app callers
-- do not check the RPC result, so the audit entries were silently dropped:
--   * use-goods-receipts.ts  — "Quantity received X -> Y" when a receipt line is edited
--   * use-purchase-orders.ts — "Import name conflict ... (not applied)" on PO import
-- Found by the 2026-11-08 stress sweep (a cross-tenant probe saw the cast error instead of "Unauthorized").
-- Same body as before with the cast removed; the guard stays fail-closed (NULL caller or org mismatch -> Unauthorized).
CREATE OR REPLACE FUNCTION public.insert_audit_entry(
  p_org_id text, p_record_type text, p_record_id text, p_action text, p_description text,
  p_field_changed text DEFAULT NULL::text, p_old_value text DEFAULT NULL::text, p_new_value text DEFAULT NULL::text
)
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
  IF v_user_id IS NULL OR public._org_mismatch(p_org_id::uuid) THEN
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
