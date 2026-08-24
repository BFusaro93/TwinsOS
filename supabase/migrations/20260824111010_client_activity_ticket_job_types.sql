-- client_activity.activity_type's CHECK constraint (20260617000001) only ever
-- allowed 'note','call','email','invoice','payment','job_visit','estimate',
-- 'contract','automation'. The ActivityType TS type (src/types/crm.ts) was
-- later extended with 'ticket' and 'job', and several call sites insert those
-- exact literal values:
--   - use-tickets.ts (ticket created -> client_activity insert)
--   - use-crm-jobs.ts (job status change -> client_activity insert)
--   - /api/crm/visits/[visitId]/complete (visit completed -> client_activity insert)
-- None of those inserts check the returned error, so every one of them has
-- been silently failing the CHECK constraint and never actually logging to
-- the client's activity timeline. Extend the constraint to match the type.

alter table client_activity drop constraint if exists client_activity_activity_type_check;
alter table client_activity add constraint client_activity_activity_type_check
  check (activity_type in (
    'note','call','email','invoice','payment',
    'job_visit','estimate','contract','automation',
    'ticket','job'
  ));
