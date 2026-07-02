-- Add estimate_id, next_fire_at, and next_event_position to crm_sequence_enrollments
ALTER TABLE crm_sequence_enrollments
  ADD COLUMN IF NOT EXISTS estimate_id          uuid REFERENCES estimates(id),
  ADD COLUMN IF NOT EXISTS next_fire_at         timestamptz,
  ADD COLUMN IF NOT EXISTS next_event_position  int NOT NULL DEFAULT 0;
