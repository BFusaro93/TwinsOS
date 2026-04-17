-- 1. Make pm_schedules.asset_id nullable (multi-asset support; join table is now the source of truth)
ALTER TABLE pm_schedules ALTER COLUMN asset_id DROP NOT NULL;

-- 2. pm_schedule_assets — join table linking a PM schedule to multiple assets/vehicles
CREATE TABLE pm_schedule_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id),
  pm_schedule_id  uuid NOT NULL REFERENCES pm_schedules(id),
  asset_id        uuid NOT NULL,           -- references assets OR vehicles; no FK (polymorphic)
  asset_name      text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (pm_schedule_id, asset_id)
);

ALTER TABLE pm_schedule_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read pm_schedule_assets"
  ON pm_schedule_assets FOR SELECT
  USING (org_id = my_org_id());

CREATE POLICY "org members can insert pm_schedule_assets"
  ON pm_schedule_assets FOR INSERT
  WITH CHECK (org_id = my_org_id());

CREATE POLICY "org members can update pm_schedule_assets"
  ON pm_schedule_assets FOR UPDATE
  USING (org_id = my_org_id());

-- 3. pm_schedule_asset_parts — parts template per asset within a PM schedule
CREATE TABLE pm_schedule_asset_parts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id),
  pm_schedule_asset_id  uuid NOT NULL REFERENCES pm_schedule_assets(id),
  part_id               uuid REFERENCES parts(id),
  part_name             text NOT NULL DEFAULT '',
  part_number           text NOT NULL DEFAULT '',
  quantity              integer NOT NULL DEFAULT 1,
  unit_cost             integer NOT NULL DEFAULT 0,  -- cents
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

ALTER TABLE pm_schedule_asset_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read pm_schedule_asset_parts"
  ON pm_schedule_asset_parts FOR SELECT
  USING (org_id = my_org_id());

CREATE POLICY "org members can insert pm_schedule_asset_parts"
  ON pm_schedule_asset_parts FOR INSERT
  WITH CHECK (org_id = my_org_id());

CREATE POLICY "org members can update pm_schedule_asset_parts"
  ON pm_schedule_asset_parts FOR UPDATE
  USING (org_id = my_org_id());

-- 4. Add 'skipped' as a valid work order status (for sub-WOs that were intentionally bypassed)
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check
  CHECK (status IN ('open', 'on_hold', 'in_progress', 'done', 'skipped'));

-- 5. org_id defaults for new tables
ALTER TABLE pm_schedule_assets ALTER COLUMN org_id SET DEFAULT my_org_id();
ALTER TABLE pm_schedule_asset_parts ALTER COLUMN org_id SET DEFAULT my_org_id();
