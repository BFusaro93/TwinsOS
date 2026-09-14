-- One-time cleanup, prod only (test has no data in this window). Not a
-- schema change -- recorded as a migration for the audit trail of what
-- was done and why.
--
-- 20260825134105_sales_rep_assigned_to_fk_target_employees.sql correctly
-- repointed work_orders/estimates/crm_jobs assignee & sales-rep FKs from
-- profiles(id) to crm_employees(id) (a real, necessary fix). But it did
-- this as separate UPDATE statements per column (assigned_to_id,
-- assigned_to_ids, sales_rep_id), each firing fn_audit_log() independently
-- -- and since the same real person resolves under both the old and new
-- id scheme, every one of those writes produced a technically-true but
-- meaningless "assigned to: Casey Kleinman -> Casey Kleinman" /
-- "sales rep id: <uuid> -> <uuid>" audit row. Confirmed live on
-- WO-2026-836665 and WO-2026-850071 (reported as "duplicate" audit
-- entries -- they weren't duplicates of a real action, they were two
-- separate no-op writes from this one migration, all timestamped
-- 2026-08-25 13:41:0X UTC, matching the migration's own filename).
--
-- Deletes only entries confirmed to carry zero real information (both
-- sides resolve to the identical person, or a raw multi-element id array
-- from the same migration's step 4 that a prior backfill had already
-- reduced to unreadable/truncated text). Explicitly preserves the ~26
-- genuine "assigned to: X -> unassigned" work_order rows from the same
-- window -- those are real: the migration's own NULL-out step correctly
-- unassigned people who had no matching crm_employees record, which is
-- a real historical event worth keeping. Verified before deleting that
-- no row in this window bundles a real change alongside the noise
-- segment (every affected description here is single-segment).

DELETE FROM audit_log
WHERE record_type = 'work_order'
  AND created_at BETWEEN '2026-08-25 13:41:00Z' AND '2026-08-25 13:41:10Z'
  AND (
    (regexp_match(description, 'assigned to: (.+) → (.+)$'))[1] = (regexp_match(description, 'assigned to: (.+) → (.+)$'))[2]
    OR description ~ 'assigned to ids: '
  );

DELETE FROM audit_log
WHERE record_type IN ('estimate', 'job')
  AND created_at BETWEEN '2026-08-25 13:41:00Z' AND '2026-08-25 13:41:10Z'
  AND description ~ 'sales rep id: d613b516-8e7d-4c82-9169-ff07980dbcc8 → 6045388d-2a21-44e5-b31a-2baab7754b96';
