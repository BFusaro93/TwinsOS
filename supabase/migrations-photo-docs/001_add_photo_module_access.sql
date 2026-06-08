-- Migration: Add photo_module_access flag to profiles
-- Admins are auto-granted; all other roles require explicit toggle.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS photo_module_access boolean NOT NULL DEFAULT false;

-- Auto-grant to all existing admins
UPDATE profiles
SET photo_module_access = true
WHERE role = 'admin' AND deleted_at IS NULL;

COMMENT ON COLUMN profiles.photo_module_access IS
  'Grants access to the Photo Documentation module. Auto-granted to admins; optional for all other roles.';
