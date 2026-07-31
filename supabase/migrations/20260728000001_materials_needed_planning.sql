-- Materials Needed for Upcoming Jobs
-- Links estimate direct-cost material lines to the product catalog, and
-- hardens crm_job_products (soft delete + RLS WITH CHECK + product index)
-- so it can double as the job-level demand source for materials planning.

ALTER TABLE estimate_direct_costs
  ADD COLUMN IF NOT EXISTS product_item_id uuid REFERENCES product_items(id) ON DELETE SET NULL;

ALTER TABLE crm_job_products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- org_id has never had a default (unlike every other org-scoped table's
-- `default my_org_id()`), so every client insert that omits org_id — including
-- the existing manual "add product to job" UI — has always 23502'd. Fix it here.
ALTER TABLE crm_job_products
  ALTER COLUMN org_id SET DEFAULT my_org_id();

DROP POLICY IF EXISTS "org members can manage crm_job_products" ON crm_job_products;
CREATE POLICY "org members can manage crm_job_products"
  ON crm_job_products
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_crm_job_products_product_id
  ON crm_job_products(product_id) WHERE deleted_at IS NULL;
