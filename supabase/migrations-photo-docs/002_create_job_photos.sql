-- Migration: job_photos table
-- Stores metadata for every photo uploaded against a project (job).
-- Originals live in job-photos-original bucket; annotated composites in job-photos-annotated.

CREATE TABLE IF NOT EXISTS job_photos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES organizations(id),
  project_id        uuid        NOT NULL REFERENCES projects(id),
  uploaded_by       uuid        NOT NULL REFERENCES profiles(id),
  uploaded_by_name  text        NOT NULL,
  storage_path      text        NOT NULL,   -- path inside job-photos-original bucket
  annotated_path    text,                   -- path inside job-photos-annotated bucket (nullable until annotated)
  thumbnail_path    text,                   -- auto-generated thumbnail path (nullable)
  file_name         text        NOT NULL,
  file_size         integer     NOT NULL,   -- bytes
  mime_type         text        NOT NULL,
  width             integer,
  height            integer,
  before_after      text        NOT NULL DEFAULT 'none'
                      CHECK (before_after IN ('before', 'after', 'none')),
  tags              text[]      NOT NULL DEFAULT '{}',
  notes             text,
  gps_lat           double precision,
  gps_lng           double precision,
  upload_context    text        NOT NULL DEFAULT 'other'
                      CHECK (upload_context IN ('site_documentation', 'progress', 'completion', 'other')),
  has_annotations   boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  created_by        uuid        REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS job_photos_project_id_idx ON job_photos(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS job_photos_org_id_idx     ON job_photos(org_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS job_photos_before_after_idx ON job_photos(project_id, before_after) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

-- Admins: full access within org
CREATE POLICY "job_photos_admin"
  ON job_photos FOR ALL
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Managers with photo access: SELECT + INSERT + UPDATE within org
CREATE POLICY "job_photos_manager"
  ON job_photos FOR ALL
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'manager' AND photo_module_access = true
    )
  );

-- Technicians with photo access: SELECT + INSERT on their org (no delete)
CREATE POLICY "job_photos_technician_select"
  ON job_photos FOR SELECT
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'technician' AND photo_module_access = true
    )
  );

CREATE POLICY "job_photos_technician_insert"
  ON job_photos FOR INSERT
  WITH CHECK (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'technician' AND photo_module_access = true
    )
  );

-- Viewers + Purchasers with photo access: SELECT only
CREATE POLICY "job_photos_readonly"
  ON job_photos FOR SELECT
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('viewer', 'purchaser')
        AND photo_module_access = true
    )
  );
