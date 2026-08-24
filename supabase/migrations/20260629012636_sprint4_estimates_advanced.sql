-- Sprint 4+: Advanced estimates features

-- 1. Customizable estimate stages
CREATE TABLE IF NOT EXISTS crm_estimate_stages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL,
  name              text        NOT NULL,
  stage_key         text        NOT NULL,
  probability_bps   int         NOT NULL DEFAULT 5000,
  sort_order        int         NOT NULL DEFAULT 0,
  is_default        boolean     NOT NULL DEFAULT false,
  is_system         boolean     NOT NULL DEFAULT false,
  active            boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  UNIQUE (org_id, stage_key)
);

ALTER TABLE crm_estimate_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage estimate stages"
  ON crm_estimate_stages
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Drop the hard-coded CHECK on estimates.stage
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_stage_check;

-- Add stage_id FK (nullable; keep stage text for backward compat — dual-write)
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES crm_estimate_stages(id);

-- 2. Property-level custom field values (rate matrix inputs)
CREATE TABLE IF NOT EXISTS crm_property_custom_field_values (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL,
  property_id   uuid        NOT NULL REFERENCES client_properties(id),
  field_def_id  uuid        NOT NULL REFERENCES crm_custom_field_defs(id),
  value_number  numeric,
  value_text    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, field_def_id)
);

ALTER TABLE crm_property_custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage property custom field values"
  ON crm_property_custom_field_values
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- 3. Service rate matrix
CREATE TABLE IF NOT EXISTS crm_service_rate_matrix (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL,
  service_id            uuid        NOT NULL REFERENCES crm_services(id),
  custom_field_id       uuid        NOT NULL REFERENCES crm_custom_field_defs(id),
  calc_type             smallint    NOT NULL DEFAULT 1,
  from_val              numeric     NOT NULL DEFAULT 0,
  to_val                numeric,
  rate_cents            int         NOT NULL DEFAULT 0,
  budgeted_hours        numeric     NOT NULL DEFAULT 0,
  budgeted_cost_cents   int         NOT NULL DEFAULT 0,
  sort_order            int         NOT NULL DEFAULT 0,
  is_tail_row           boolean     NOT NULL DEFAULT false,
  tail_every_qty        numeric,
  tail_over_qty         numeric,
  deleted_at            timestamptz
);

CREATE INDEX IF NOT EXISTS crm_service_rate_matrix_service_id_idx
  ON crm_service_rate_matrix (service_id);

ALTER TABLE crm_service_rate_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage service rate matrix"
  ON crm_service_rate_matrix
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- 4. Line item sub-items (products / subservices under a line item)
CREATE TABLE IF NOT EXISTS estimate_line_item_subitems (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid        NOT NULL,
  line_item_id                uuid        NOT NULL REFERENCES estimate_line_items(id),
  type                        text        NOT NULL DEFAULT 'product' CHECK (type IN ('product','subservice')),
  product_id                  uuid,
  service_id                  uuid,
  name                        text        NOT NULL,
  qty                         numeric     NOT NULL DEFAULT 1,
  rate_cents                  int         NOT NULL DEFAULT 0,
  cost_cents                  int         NOT NULL DEFAULT 0,
  total_cents                 int         NOT NULL DEFAULT 0,
  confirm_qty                 boolean     NOT NULL DEFAULT false,
  invoice                     boolean     NOT NULL DEFAULT true,
  print_on_invoice            boolean     NOT NULL DEFAULT true,
  create_installed_product    boolean     NOT NULL DEFAULT false,
  sort_order                  int         NOT NULL DEFAULT 0,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_line_item_subitems_line_item_id_idx
  ON estimate_line_item_subitems (line_item_id);

ALTER TABLE estimate_line_item_subitems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage line item subitems"
  ON estimate_line_item_subitems
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- 5. Per-type overhead settings (one row per org)
CREATE TABLE IF NOT EXISTS crm_overhead_settings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL UNIQUE,
  labor_oh_bps        int         NOT NULL DEFAULT 0,
  labor_burden_bps    int         NOT NULL DEFAULT 0,
  contract_oh_bps     int         NOT NULL DEFAULT 0,
  equipment_oh_bps    int         NOT NULL DEFAULT 0,
  materials_oh_bps    int         NOT NULL DEFAULT 0,
  other_oh_bps        int         NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_overhead_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage overhead settings"
  ON crm_overhead_settings
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
