-- Migration: Supabase Storage bucket policies
-- Run after creating buckets: job-photos-original, job-photos-annotated
-- (Create buckets via Supabase dashboard or CLI: supabase storage create job-photos-original --public=false)

-- ── job-photos-original ──────────────────────────────────────────────────────

-- Admins + managers: full access to originals
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES
(
  'originals_admin_manager_select',
  'job-photos-original',
  'SELECT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
        AND photo_module_access = true
    )
  ) $$
),
(
  'originals_admin_manager_insert',
  'job-photos-original',
  'INSERT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
        AND photo_module_access = true
    )
  ) $$
),
(
  'originals_admin_manager_delete',
  'job-photos-original',
  'DELETE',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
        AND photo_module_access = true
    )
  ) $$
),
-- Technicians: read + upload
(
  'originals_technician_select',
  'job-photos-original',
  'SELECT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'technician'
        AND photo_module_access = true
    )
  ) $$
),
(
  'originals_technician_insert',
  'job-photos-original',
  'INSERT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'technician'
        AND photo_module_access = true
    )
  ) $$
),
-- Viewers + purchasers: read only
(
  'originals_viewer_select',
  'job-photos-original',
  'SELECT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('viewer', 'purchaser')
        AND photo_module_access = true
    )
  ) $$
);

-- ── job-photos-annotated ─────────────────────────────────────────────────────

INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES
(
  'annotated_admin_manager_all',
  'job-photos-annotated',
  'SELECT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
        AND photo_module_access = true
    )
  ) $$
),
(
  'annotated_admin_manager_insert',
  'job-photos-annotated',
  'INSERT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
        AND photo_module_access = true
    )
  ) $$
),
-- All photo-enabled roles can read annotated composites
(
  'annotated_any_photo_access_select',
  'job-photos-annotated',
  'SELECT',
  $$ (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('technician', 'viewer', 'purchaser')
        AND photo_module_access = true
    )
  ) $$
);
