-- IF Branch blocks: a step can now be nested under an if_branch step.
--
-- crm_sequence_events stays a flat, position-ordered list (the processor walks
-- it by position). parent_event_id marks which IF a step sits inside; a block's
-- steps are always contiguous and directly after their IF, so "skip the block"
-- is "advance past the last descendant of the IF".

ALTER TABLE crm_sequence_events
  ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES crm_sequence_events(id) ON DELETE CASCADE;

ALTER TABLE crm_sequence_events
  DROP CONSTRAINT IF EXISTS crm_sequence_events_parent_not_self;
ALTER TABLE crm_sequence_events
  ADD CONSTRAINT crm_sequence_events_parent_not_self CHECK (parent_event_id IS NULL OR parent_event_id <> id);

CREATE INDEX IF NOT EXISTS crm_sequence_events_parent_idx
  ON crm_sequence_events (parent_event_id) WHERE parent_event_id IS NOT NULL;

-- Preserve what existing IF branches did at runtime: they guarded exactly the
-- one step immediately after them. Record that as real nesting so the builder
-- shows it and nothing changes for sequences already running.
UPDATE crm_sequence_events c
SET parent_event_id = x.if_id
FROM (
  SELECT i.id AS if_id,
         (SELECT n.id
            FROM crm_sequence_events n
           WHERE n.sequence_id = i.sequence_id
             AND n.deleted_at IS NULL
             AND n.position > i.position
           ORDER BY n.position
           LIMIT 1) AS child_id
    FROM crm_sequence_events i
   WHERE i.event_type = 'if_branch'
     AND i.deleted_at IS NULL
) x
WHERE c.id = x.child_id
  AND c.parent_event_id IS NULL;

-- Appends a step to a sequence: at the end of the sequence (no parent) or at
-- the end of an IF's block. Inserting inside a block means shifting every later
-- step down one position; enrollments already waiting at or past that spot are
-- shifted with them so each still points at the same step it did before.
-- SECURITY INVOKER: the caller's RLS applies to every table touched.
CREATE OR REPLACE FUNCTION public.crm_insert_sequence_event(
  p_sequence_id uuid,
  p_event_type text,
  p_config jsonb DEFAULT '{}'::jsonb,
  p_parent_event_id uuid DEFAULT NULL
) RETURNS crm_sequence_events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pos int;
  v_parent crm_sequence_events;
  v_row crm_sequence_events;
BEGIN
  -- Serialize concurrent inserts into the same sequence.
  PERFORM 1 FROM crm_automation_sequences WHERE id = p_sequence_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sequence not found';
  END IF;

  IF p_parent_event_id IS NULL THEN
    SELECT COALESCE(MAX(position), -1) + 1 INTO v_pos
      FROM crm_sequence_events
     WHERE sequence_id = p_sequence_id AND deleted_at IS NULL;
  ELSE
    SELECT * INTO v_parent
      FROM crm_sequence_events
     WHERE id = p_parent_event_id
       AND sequence_id = p_sequence_id
       AND event_type = 'if_branch'
       AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent must be an IF branch step in this sequence';
    END IF;

    WITH RECURSIVE d AS (
      SELECT id, position FROM crm_sequence_events
       WHERE parent_event_id = p_parent_event_id AND deleted_at IS NULL
      UNION ALL
      SELECT e.id, e.position FROM crm_sequence_events e
        JOIN d ON e.parent_event_id = d.id
       WHERE e.deleted_at IS NULL
    )
    SELECT COALESCE(MAX(position), v_parent.position) + 1 INTO v_pos FROM d;

    UPDATE crm_sequence_events
       SET position = position + 1
     WHERE sequence_id = p_sequence_id AND position >= v_pos;

    UPDATE crm_sequence_enrollments
       SET next_event_position = next_event_position + 1
     WHERE sequence_id = p_sequence_id
       AND completed_at IS NULL
       AND stopped_at IS NULL
       AND next_event_position >= v_pos;
  END IF;

  INSERT INTO crm_sequence_events (sequence_id, event_type, config, position, parent_event_id)
  VALUES (p_sequence_id, p_event_type, COALESCE(p_config, '{}'::jsonb), v_pos, p_parent_event_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_insert_sequence_event(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_insert_sequence_event(uuid, text, jsonb, uuid) TO authenticated;
