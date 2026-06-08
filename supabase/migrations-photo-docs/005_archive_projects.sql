-- Add is_archived flag to projects.
-- Archived projects are hidden from the active list and from PO dropdowns.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS projects_is_archived_idx ON projects(is_archived) WHERE deleted_at IS NULL;
