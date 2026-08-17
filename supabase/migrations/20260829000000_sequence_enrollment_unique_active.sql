-- isEligibleForEnrollment() (sequence-enrollment.ts) is a plain SELECT-then-
-- INSERT with no DB-level backstop: it checks whether the most recent
-- enrollment for a given (sequence, client/estimate/ticket/invoice) key is
-- still in flight (completed_at and stopped_at both null), then a separate
-- call to enrollClientInSequence() inserts a new row. Two triggers firing in
-- quick succession for the same client/estimate (e.g. two visits for the
-- same service completing back-to-back) can both pass the eligibility check
-- before either insert lands, double-enrolling the client — every
-- subsequent send in the sequence then goes out twice.
--
-- These four partial unique indexes enforce "at most one IN-FLIGHT
-- enrollment per (sequence, scoping key)" at the DB level, one per scoping
-- key (client-only, estimate, ticket, invoice — matching
-- isEligibleForEnrollment's own eq() branches). A completed/stopped
-- enrollment falls outside the partial index's WHERE clause, so legitimate
-- re-enrollment after the reentry window still inserts a fresh row; only a
-- true concurrent duplicate (both still in-flight) collides. The insert
-- error this produces is already handled: enrollClientInSequence() returns
-- false on any insert error.

create unique index if not exists crm_sequence_enrollments_active_client_uidx
  on crm_sequence_enrollments (sequence_id, client_id)
  where estimate_id is null and ticket_id is null and invoice_id is null
    and completed_at is null and stopped_at is null and deleted_at is null;

create unique index if not exists crm_sequence_enrollments_active_estimate_uidx
  on crm_sequence_enrollments (sequence_id, estimate_id)
  where estimate_id is not null
    and completed_at is null and stopped_at is null and deleted_at is null;

create unique index if not exists crm_sequence_enrollments_active_ticket_uidx
  on crm_sequence_enrollments (sequence_id, ticket_id)
  where ticket_id is not null
    and completed_at is null and stopped_at is null and deleted_at is null;

create unique index if not exists crm_sequence_enrollments_active_invoice_uidx
  on crm_sequence_enrollments (sequence_id, invoice_id)
  where invoice_id is not null
    and completed_at is null and stopped_at is null and deleted_at is null;
