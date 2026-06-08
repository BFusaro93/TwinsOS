-- Migration: photo_annotations table
-- Stores Fabric.js canvas JSON per photo. Non-destructive — original always preserved.

CREATE TABLE IF NOT EXISTS photo_annotations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id),
  photo_id    uuid        NOT NULL REFERENCES job_photos(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES profiles(id),
  author_name text        NOT NULL,
  fabric_json jsonb       NOT NULL,   -- full Fabric.js canvas JSON
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_annotations_photo_id_idx ON photo_annotations(photo_id);
CREATE INDEX IF NOT EXISTS photo_annotations_org_id_idx   ON photo_annotations(org_id);

-- One annotation record per photo (upserted — latest state replaces previous)
CREATE UNIQUE INDEX IF NOT EXISTS photo_annotations_photo_unique
  ON photo_annotations(photo_id);

ALTER TABLE photo_annotations ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "annotations_admin"
  ON photo_annotations FOR ALL
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Managers: full access
CREATE POLICY "annotations_manager"
  ON photo_annotations FOR ALL
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'manager' AND photo_module_access = true
    )
  );

-- All other photo-enabled roles: read only
CREATE POLICY "annotations_readonly"
  ON photo_annotations FOR SELECT
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('technician', 'viewer', 'purchaser')
        AND photo_module_access = true
    )
  );
