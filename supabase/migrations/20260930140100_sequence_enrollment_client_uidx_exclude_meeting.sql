-- crm_sequence_enrollments_active_client_uidx (20260824113700) enforces one
-- in-flight client-scoped enrollment per (sequence, client). It predates the
-- meeting_id scoping key (20260829000000), so its WHERE clause never excluded
-- meeting-scoped rows: a client with two upcoming sales meetings in the same
-- reminder sequence collided on this index and the second meeting's
-- enrollment was silently dropped. Meeting-scoped rows are already covered
-- by crm_sequence_enrollments_active_meeting_uidx.
--
-- Recreate with `and meeting_id is null`; every other predicate is unchanged.
-- The new predicate is strictly narrower than the old one, so no existing
-- rows can violate it. Idempotent: safe to re-run.
drop index if exists public.crm_sequence_enrollments_active_client_uidx;

create unique index if not exists crm_sequence_enrollments_active_client_uidx
  on public.crm_sequence_enrollments (sequence_id, client_id)
  where estimate_id is null and ticket_id is null and invoice_id is null
    and meeting_id is null
    and completed_at is null and stopped_at is null and deleted_at is null;
