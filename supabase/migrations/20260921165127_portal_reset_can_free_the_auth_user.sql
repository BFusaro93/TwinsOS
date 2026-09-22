-- ─────────────────────────────────────────────────────────────────────────────
-- Let "Reset portal access" actually free the email for re-registration.
--
-- Reproduced on production: resetting a client's portal access reported
-- success, a fresh invite was issued, and /portal/register then failed with
-- "A user with this email address has already been registered" — permanently.
-- Once a client had portal access, it could never be re-established.
--
-- Cause: portal-reset SOFT-deletes the client_portal_users row (this project
-- never hard-deletes — see CLAUDE.md), so the row physically survives and its
-- FK still points at auth.users. auth.admin.deleteUser() is then rejected by
--
--   client_portal_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
--
-- which has no ON DELETE action, so it defaults to NO ACTION. The route never
-- checked the delete's result, so the failure was invisible and it returned
-- success anyway.
--
-- estimates.portal_user_id has the same defect and blocks the delete just as
-- hard for any client who has ever accepted a proposal through the portal —
-- verified, the client this was reproduced on had exactly one such estimate.
--
-- Fix: SET NULL rather than CASCADE on both. CASCADE would hard-delete the
-- history the soft-delete policy exists to preserve — the client_portal_users
-- row is the audit record of who had access, and an estimate's acceptance
-- (portal_accepted_at, portal_signature_name) has to outlive the login that
-- produced it. SET NULL detaches the dead auth user and leaves both intact.
--
-- user_id therefore has to become nullable. Nothing reads it on a soft-deleted
-- row: getPortalContext() resolves only rows where deleted_at is null.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.client_portal_users
  alter column user_id drop not null;

alter table public.client_portal_users
  drop constraint if exists client_portal_users_user_id_fkey;

alter table public.client_portal_users
  add constraint client_portal_users_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.estimates
  drop constraint if exists estimates_portal_user_id_fkey;

alter table public.estimates
  add constraint estimates_portal_user_id_fkey
  foreign key (portal_user_id) references auth.users(id) on delete set null;
