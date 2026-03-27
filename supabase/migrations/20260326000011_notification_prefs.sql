-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: notification_prefs
-- Adds a per-user notification preferences column to the profiles table so
-- that the Notifications settings page can persist toggle state across sessions
-- and devices.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow users to update their own notification_prefs
-- (The existing "users_update_own_profile" policy already covers this since it
-- allows updates to the whole row, but we explicitly document intent here.)
-- No additional policy needed — handled by existing profile self-update policy.
