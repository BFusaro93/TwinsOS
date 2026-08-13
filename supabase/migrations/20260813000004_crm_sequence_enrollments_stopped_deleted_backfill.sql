-- Schema-drift backfill: crm_sequence_enrollments.stopped_at/deleted_at exist
-- on prod (added at some point via an ad-hoc/MCP call, never captured in a
-- migration file) but were missing on test. Every automation-processor query
-- filters on both columns (`.is("stopped_at", null)`, `.is("deleted_at",
-- null)`) — on a DB missing them the query 42703s, the error is caught and
-- logged rather than thrown, and the processor silently no-ops for every
-- enrollment. IF NOT EXISTS makes this a safe no-op against prod.
alter table crm_sequence_enrollments
  add column if not exists stopped_at timestamptz,
  add column if not exists deleted_at timestamptz;
