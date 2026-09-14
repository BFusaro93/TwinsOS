-- One-time data backfill, companion to 20260901030000. That migration
-- stopped NEW audit_log rows from leaking raw asset/assignee uuids, but
-- ~900 historical rows already had them baked into their stored
-- `description` text (found while investigating why WO-2026-000617's
-- audit trail still showed "asset id: blank -> <uuid>" and
-- "assigned to ids: [] -> [\"<uuid>\"]" despite the trigger fix already
-- being live — the trigger fix only affects rows written after it).
--
-- Three historical leak patterns, not just the one the trigger fix
-- addressed:
--   - "assigned to ids: [...] -> [...]"  (plural, multi-assignee, never
--     covered by any prior fix)
--   - "assigned to id: <uuid> -> <uuid>" (singular, predates the
--     20260830130000 fix entirely)
--   - "asset id: <uuid> -> <uuid>"        (never covered by any prior fix)
--
-- Complications discovered while designing this:
--   - Some ids are pre-migration profiles.id values rather than
--     crm_employees.id (same FK-drift class as the PM-schedule/ticket
--     assignee fixes) -- resolver falls back to profiles.
--   - Some asset_id values are actually vehicles.id, from before
--     linked_entity_type existed -- resolver falls back to vehicles.
--   - A handful of multi-element arrays were hard-truncated to 40 chars
--     by the trigger's own field-length cap before storage -- the
--     original second id was never captured, so these are left
--     completely untouched rather than guessing.
--   - Any row where a referenced id doesn't resolve in EITHER fallback
--     table is also left untouched (never fabricate "blank -> blank").
--
-- Verified 2026-09-01: 873 rows rewritten, 0 unresolved, 19 left
-- untouched (truncated originals), applied to both prod and test.
DO $$
DECLARE
  r RECORD;
  segs text[];
  seg text;
  new_segs text[];
  prefix text;
  has_assigned_names boolean;
  has_asset_name boolean;
  m text[];
  ids_arr text[];
  names_arr text[];
  one_id text;
  one_name text;
  old_side text;
  new_side text;
  row_ok boolean;
BEGIN
  DROP TABLE IF EXISTS audit_backfill_result;
  CREATE TEMP TABLE audit_backfill_result (
    id uuid,
    old_description text,
    new_description text,
    status text
  );

  FOR r IN
    SELECT id, description FROM audit_log
    WHERE record_type = 'work_order'
      AND (description ~ 'assigned to ids: ' OR description ~ 'assigned to id: ' OR description ~ 'asset id: ')
      AND description NOT LIKE '%…%'
  LOOP
    prefix := split_part(r.description, ' — ', 1);
    segs := string_to_array(substring(r.description from position(' — ' in r.description) + 3), '; ');
    has_assigned_names := (r.description ~ 'assigned to names: ' OR r.description ~ '(^|; )assigned to: ');
    has_asset_name := (r.description ~ 'asset name: ');
    new_segs := ARRAY[]::text[];
    row_ok := true;

    FOREACH seg IN ARRAY segs LOOP
      IF seg LIKE 'assigned to ids: %' AND has_assigned_names THEN
        CONTINUE;
      ELSIF seg LIKE 'assigned to ids: %' THEN
        m := regexp_match(seg, '\[(.*)\] → \[(.*)\]');
        IF m IS NULL THEN row_ok := false; new_segs := new_segs || seg; CONTINUE; END IF;

        ids_arr := array_remove(string_to_array(replace(replace(m[1], '"', ''), ' ', ''), ','), '');
        names_arr := ARRAY[]::text[];
        FOREACH one_id IN ARRAY ids_arr LOOP
          SELECT coalesce(
            (SELECT nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') FROM crm_employees WHERE id::text = one_id),
            (SELECT name FROM profiles WHERE id::text = one_id)
          ) INTO one_name;
          IF one_name IS NULL THEN row_ok := false; END IF;
          names_arr := names_arr || coalesce(one_name, one_id);
        END LOOP;
        old_side := CASE WHEN array_length(ids_arr,1) IS NULL THEN 'unassigned' ELSE array_to_string(names_arr, ', ') END;

        ids_arr := array_remove(string_to_array(replace(replace(m[2], '"', ''), ' ', ''), ','), '');
        names_arr := ARRAY[]::text[];
        FOREACH one_id IN ARRAY ids_arr LOOP
          SELECT coalesce(
            (SELECT nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') FROM crm_employees WHERE id::text = one_id),
            (SELECT name FROM profiles WHERE id::text = one_id)
          ) INTO one_name;
          IF one_name IS NULL THEN row_ok := false; END IF;
          names_arr := names_arr || coalesce(one_name, one_id);
        END LOOP;
        new_side := CASE WHEN array_length(ids_arr,1) IS NULL THEN 'unassigned' ELSE array_to_string(names_arr, ', ') END;

        new_segs := new_segs || ('assigned to: ' || old_side || ' → ' || new_side);

      ELSIF seg LIKE 'assigned to id: %' AND has_assigned_names THEN
        CONTINUE;
      ELSIF seg LIKE 'assigned to id: %' THEN
        m := regexp_match(seg, 'assigned to id: (\S+) → (\S+)');
        IF m IS NULL THEN row_ok := false; new_segs := new_segs || seg; CONTINUE; END IF;
        old_side := nullif(m[1], 'blank'); new_side := nullif(m[2], 'blank');
        IF old_side IS NOT NULL THEN
          SELECT coalesce(
            (SELECT nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') FROM crm_employees WHERE id::text = old_side),
            (SELECT name FROM profiles WHERE id::text = old_side)
          ) INTO one_name;
          IF one_name IS NULL THEN row_ok := false; ELSE old_side := one_name; END IF;
        ELSE old_side := 'unassigned'; END IF;
        IF new_side IS NOT NULL THEN
          SELECT coalesce(
            (SELECT nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') FROM crm_employees WHERE id::text = new_side),
            (SELECT name FROM profiles WHERE id::text = new_side)
          ) INTO one_name;
          IF one_name IS NULL THEN row_ok := false; ELSE new_side := one_name; END IF;
        ELSE new_side := 'unassigned'; END IF;
        new_segs := new_segs || ('assigned to: ' || old_side || ' → ' || new_side);

      ELSIF seg LIKE 'asset id: %' AND has_asset_name THEN
        CONTINUE;
      ELSIF seg LIKE 'asset id: %' THEN
        m := regexp_match(seg, 'asset id: (\S+) → (\S+)');
        IF m IS NULL THEN row_ok := false; new_segs := new_segs || seg; CONTINUE; END IF;
        old_side := nullif(m[1], 'blank'); new_side := nullif(m[2], 'blank');
        IF old_side IS NOT NULL THEN
          SELECT coalesce(
            (SELECT name FROM assets WHERE id::text = old_side),
            (SELECT name FROM vehicles WHERE id::text = old_side)
          ) INTO one_name;
          IF one_name IS NULL THEN row_ok := false; ELSE old_side := one_name; END IF;
        ELSE old_side := 'blank'; END IF;
        IF new_side IS NOT NULL THEN
          SELECT coalesce(
            (SELECT name FROM assets WHERE id::text = new_side),
            (SELECT name FROM vehicles WHERE id::text = new_side)
          ) INTO one_name;
          IF one_name IS NULL THEN row_ok := false; ELSE new_side := one_name; END IF;
        ELSE new_side := 'blank'; END IF;
        new_segs := new_segs || ('asset: ' || old_side || ' → ' || new_side);

      ELSE
        new_segs := new_segs || seg;
      END IF;
    END LOOP;

    INSERT INTO audit_backfill_result VALUES (
      r.id, r.description,
      prefix || ' — ' || array_to_string(new_segs, '; '),
      CASE WHEN row_ok THEN 'ok' ELSE 'unresolved' END
    );
  END LOOP;

  UPDATE audit_log a
  SET description = b.new_description
  FROM audit_backfill_result b
  WHERE a.id = b.id AND b.status = 'ok';

  DROP TABLE IF EXISTS audit_backfill_result;
END $$;
