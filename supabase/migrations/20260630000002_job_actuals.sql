-- Actual materials used on a job
CREATE TABLE IF NOT EXISTS crm_job_materials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id),
  job_id          uuid NOT NULL REFERENCES crm_jobs(id),
  visit_id        uuid REFERENCES crm_job_visits(id),
  description     text NOT NULL,
  qty             numeric NOT NULL DEFAULT 1,
  unit_cost_cents integer NOT NULL DEFAULT 0,
  total_cost_cents integer GENERATED ALWAYS AS (ROUND(qty * unit_cost_cents)) STORED,
  notes           text,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS crm_job_materials_job_idx ON crm_job_materials(job_id);

ALTER TABLE crm_job_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage job materials"
  ON crm_job_materials FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Actual labor cost rollup columns on crm_jobs
ALTER TABLE crm_jobs
  ADD COLUMN IF NOT EXISTS actual_labor_cost_cents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_material_cost_cents integer NOT NULL DEFAULT 0;
