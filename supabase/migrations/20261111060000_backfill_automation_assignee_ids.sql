-- Equipt automations: "Assigned To" was free text (action_config.assigned_to)
-- and the executor only wrote it to work_orders.assigned_to_name, so generated
-- work orders were never actually assigned. The picker now stores
-- action_config.assigned_to_id = crm_employees.id. Backfill it from the old
-- text, per org, case-insensitively: full "First Last" match, or a first-name-only
-- value ("Casey"). Only UNAMBIGUOUS matches (exactly one active employee) are
-- written; zero- or multi-match rows are left alone and reported via NOTICE.

-- Requests had no assignee at all, so a "Create WO Request" automation could
-- never hand one on. The automation now stamps it here and Convert to Work
-- Order copies it onto the WO.
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS assigned_to_id uuid REFERENCES crm_employees(id),
  ADD COLUMN IF NOT EXISTS assigned_to_name text;

DO $$
DECLARE
  r record;
  n_matches int;
  emp record;
  updated int := 0;
BEGIN
  FOR r IN
    SELECT id, org_id, name, btrim(action_config->>'assigned_to') AS txt
    FROM automations
    WHERE deleted_at IS NULL
      AND action_type IN ('create_work_order', 'create_wo_request')
      AND btrim(coalesce(action_config->>'assigned_to', '')) <> ''
      AND coalesce(action_config->>'assigned_to_id', '') = ''
  LOOP
    SELECT count(*) INTO n_matches
    FROM crm_employees e
    WHERE e.org_id = r.org_id AND e.is_active AND e.deleted_at IS NULL
      AND (lower(btrim(e.first_name || ' ' || e.last_name)) = lower(r.txt)
           OR (position(' ' in r.txt) = 0 AND lower(btrim(e.first_name)) = lower(r.txt)));

    IF n_matches = 1 THEN
      SELECT e.id, btrim(e.first_name || ' ' || e.last_name) AS full_name INTO emp
      FROM crm_employees e
      WHERE e.org_id = r.org_id AND e.is_active AND e.deleted_at IS NULL
        AND (lower(btrim(e.first_name || ' ' || e.last_name)) = lower(r.txt)
             OR (position(' ' in r.txt) = 0 AND lower(btrim(e.first_name)) = lower(r.txt)));
      UPDATE automations
      SET action_config = action_config
            || jsonb_build_object('assigned_to_id', emp.id, 'assigned_to', emp.full_name)
      WHERE id = r.id;
      updated := updated + 1;
    ELSE
      RAISE NOTICE 'automation % (%, org %): assigned_to "%" matched % employees — left unchanged',
        r.id, r.name, r.org_id, r.txt, n_matches;
    END IF;
  END LOOP;
  RAISE NOTICE 'backfilled % automation(s)', updated;
END $$;
