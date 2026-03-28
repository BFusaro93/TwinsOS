-- Fix insert_audit_entry parameter types to avoid uuid/text mismatch
-- when comparing p_org_id with my_org_id() which returns text.

DROP FUNCTION IF EXISTS public.insert_audit_entry(uuid, text, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.insert_audit_entry(
  p_org_id        text,
  p_record_type   text,
  p_record_id     text,
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
  IF v_user_id IS NULL OR p_org_id::uuid != public.my_org_id()::uuid THEN
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
$$;
