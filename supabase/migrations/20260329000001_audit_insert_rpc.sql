-- ─────────────────────────────────────────────────────────────────────────────
-- RPC function for client-side audit_log inserts.
-- Uses SECURITY DEFINER so the insert bypasses RLS, while still
-- verifying the caller belongs to the specified org_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.insert_audit_entry(
  p_org_id        uuid,
  p_record_type   text,
  p_record_id     uuid,
  p_action        text,
  p_description   text,
  p_field_changed text DEFAULT NULL,
  p_old_value     text DEFAULT NULL,
  p_new_value     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_user_name text;
BEGIN
  v_user_id := auth.uid();

  -- Verify caller belongs to the org
  IF v_user_id IS NULL OR p_org_id != public.my_org_id() THEN
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
    p_org_id, v_user_id, p_record_type, p_record_id, p_action,
    v_user_name, p_description, p_field_changed, p_old_value, p_new_value
  );
END;
$$;
