-- Visit occurrence identity (recurring / package visit generators).
--
-- Both visit generators (/api/cron/recurring-visits and
-- /api/crm/jobs/generate-visits, now sharing src/lib/visits/recurrence.ts)
-- used to dedupe only against LIVE visits on the same scheduled_date, so a
-- visit the office moved to another day or deleted was silently re-created
-- on its original date the next time either generator ran.
--
-- occurrence_date is the date the generator produced a visit FOR. Moving a
-- visit changes scheduled_date but never occurrence_date; deleting a visit
-- keeps the (soft-deleted) row and its occurrence_date, so the generators
-- skip any (job, job_service, occurrence_date) that exists at all — live or
-- deleted. System prunes (schedule change, hold, cancel) null occurrence_date
-- on the rows they remove so the occurrence can be regenerated later.
--
-- Idempotent.

alter table public.crm_job_visits
  add column if not exists occurrence_date date;

comment on column public.crm_job_visits.occurrence_date is
  'Date the recurring/package generator produced this visit for. Not changed when the visit is moved. NULL for manually created visits and for visits removed by a system prune (schedule change / hold / cancel), which frees the occurrence to be regenerated.';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Existing visits of recurring/package jobs get occurrence_date =
-- scheduled_date (the best available approximation — a visit already moved
-- before this migration keeps its CURRENT date as its identity).
--
-- Pre-existing duplicates (same job + service + date) would violate the
-- unique index below. The EARLIEST row of each duplicate set (created_at,
-- then id) keeps the identity; later duplicates are left with NULL
-- occurrence_date and reported via NOTICE for manual cleanup. On PROD as of
-- 2026-09-27 these are:
--   job 6cf4c559-8062-4a9c-bf66-7d9a3051e401 2026-09-06: keeps 6c65491d…, NULL on b4996c10-02dd-4149-bb20-946c979e7e67 (both completed)
--   job 84005bec-00d1-4647-b0e3-357fc615b966 2026-09-01: keeps ac9b5be2…, NULL on 4a5d68e4-0d31-45c6-b1b8-5a242f2a7944 (both scheduled)
do $$
declare
  r record;
begin
  -- Bookkeeping backfill: keep it out of every record's audit trail.
  perform set_config('app.suppress_audit', 'true', true);
  with ranked as (
    select v.id,
           v.scheduled_date,
           row_number() over (
             partition by v.job_id,
                          coalesce(v.job_service_id, '00000000-0000-0000-0000-000000000000'::uuid),
                          v.scheduled_date
             order by (v.deleted_at is not null), v.created_at, v.id
           ) as rn
    from public.crm_job_visits v
    join public.crm_jobs j on j.id = v.job_id
    where j.job_type in ('recurring', 'package')
      and v.occurrence_date is null
      and v.scheduled_date is not null
      -- a later re-run must not collide with identities set since
      and not exists (
        select 1 from public.crm_job_visits o
        where o.job_id = v.job_id
          and coalesce(o.job_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(v.job_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
          and o.occurrence_date = v.scheduled_date
      )
  )
  update public.crm_job_visits v
     set occurrence_date = ranked.scheduled_date
    from ranked
   where ranked.id = v.id
     and ranked.rn = 1;

  for r in
    select v.id, v.job_id, v.scheduled_date
    from public.crm_job_visits v
    join public.crm_jobs j on j.id = v.job_id
    where j.job_type in ('recurring', 'package')
      and v.occurrence_date is null
      and v.scheduled_date is not null
      and exists (
        select 1 from public.crm_job_visits o
        where o.id <> v.id
          and o.job_id = v.job_id
          and coalesce(o.job_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(v.job_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
          and o.occurrence_date = v.scheduled_date
      )
  loop
    raise notice 'duplicate visit left without occurrence_date: visit % (job %, %)', r.id, r.job_id, r.scheduled_date;
  end loop;
end $$;

-- ── Identity index ──────────────────────────────────────────────────────────
-- Deliberately includes soft-deleted rows: a deleted occurrence stays claimed.
create unique index if not exists crm_job_visits_occurrence_unique
  on public.crm_job_visits (
    job_id,
    coalesce(job_service_id, '00000000-0000-0000-0000-000000000000'::uuid),
    occurrence_date
  )
  where occurrence_date is not null;
