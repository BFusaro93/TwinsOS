-- Remove SECURITY DEFINER so auth.uid() works correctly in the function context
CREATE OR REPLACE FUNCTION next_damage_case_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year   text := to_char(now(), 'YYYY');
  v_org_id uuid;
  v_count  int;
BEGIN
  SELECT org_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  SELECT COUNT(*) + 1
    INTO v_count
    FROM damage_cases
   WHERE org_id = v_org_id
     AND to_char(created_at, 'YYYY') = v_year
     AND deleted_at IS NULL;
  RETURN 'DC-' || v_year || '-' || lpad(v_count::text, 3, '0');
END;
$$;
