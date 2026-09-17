-- Per-user UI preferences (e.g. which dispatch board / waiting list columns
-- are visible), keyed by a view name inside a single jsonb blob so future
-- views can reuse the same column without another migration.
--
-- Safe under the existing "users_update_own_profile" RLS policy (id =
-- auth.uid()) — that policy has no column restriction, and
-- prevent_profile_role_escalation only guards role/org_id, so a user
-- freely updating their own ui_prefs is already covered.
alter table public.profiles
  add column if not exists ui_prefs jsonb not null default '{}'::jsonb;
