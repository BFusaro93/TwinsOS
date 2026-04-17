-- pm_schedule_parts
-- Parts that are expected to be used when a PM schedule WO is generated.
-- Mirrors wo_parts schema but linked to pm_schedules instead of work_orders.

CREATE TABLE IF NOT EXISTS pm_schedule_parts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id),
  pm_schedule_id uuid NOT NULL REFERENCES pm_schedules(id) ON DELETE CASCADE,
  part_id       uuid REFERENCES parts(id) ON DELETE SET NULL,
  part_name     text NOT NULL,
  part_number   text NOT NULL DEFAULT '',
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost     integer NOT NULL DEFAULT 0 CHECK (unit_cost >= 0), -- cents
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_pm_schedule_parts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pm_schedule_parts_updated_at
  BEFORE UPDATE ON pm_schedule_parts
  FOR EACH ROW
  EXECUTE FUNCTION set_pm_schedule_parts_updated_at();

-- Row Level Security
ALTER TABLE pm_schedule_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_pm_schedule_parts"
  ON pm_schedule_parts
  FOR ALL
  USING (org_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (org_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));
