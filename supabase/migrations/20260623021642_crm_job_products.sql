-- Materials/products used on a CRM job.
-- References product_items (the shared catalog) but allows a nullable FK
-- so crews can add ad-hoc line items not yet in the catalog.
CREATE TABLE IF NOT EXISTS crm_job_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES crm_jobs(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES product_items(id) ON DELETE SET NULL,
  product_name    text NOT NULL,
  qty             numeric NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  unit_cost_cents  integer,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE crm_job_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage crm_job_products"
  ON crm_job_products
  FOR ALL
  USING (
    org_id = (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX idx_crm_job_products_job_id ON crm_job_products(job_id);
CREATE INDEX idx_crm_job_products_org_id ON crm_job_products(org_id);
