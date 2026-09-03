-- Bug 13: /api/pm-schedules/[id]/generate-wo (route.ts) guards against
-- double-firing with a check-then-insert: it queries for any open top-level
-- WO from this schedule, and only inserts a new batch if none is found.
-- That's not atomic — two near-simultaneous POSTs (a double-click, or two
-- automation/cron triggers) can both pass the check before either insert
-- lands, producing two WO batches and double parts-inventory deduction.
--
-- An advisory lock doesn't close this race here: the route makes its check
-- and its insert as separate PostgREST requests through the Supabase JS
-- client (each its own implicit transaction/connection from the pool), so a
-- pg_advisory_xact_lock taken in one call is released before the next call
-- even starts — the same reasoning already documented against advisory
-- locks for next_damage_case_number() in
-- 20260829100000_fix_damage_case_bugs.sql. A real constraint that the
-- database enforces regardless of transaction boundaries is what actually
-- closes it: at most one open (not done/skipped, not soft-deleted)
-- top-level (parent_work_order_id is null) work order per pm_schedule_id.
-- The second concurrent insert now fails with a unique_violation (23505)
-- instead of silently succeeding, and the route catches that and returns
-- the same "already generated" 409 the check-then-insert path returns today.

create unique index if not exists work_orders_pm_schedule_open_batch_unique
  on public.work_orders (pm_schedule_id)
  where deleted_at is null
    and parent_work_order_id is null
    and pm_schedule_id is not null
    and status not in ('done', 'skipped');
