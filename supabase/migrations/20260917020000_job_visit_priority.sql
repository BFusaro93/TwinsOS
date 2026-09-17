-- "High priority" flag for dispatching — distinct from crm_jobs.priority /
-- crm_job_visits.priority, which are unrelated route-ordering fields (see
-- comment at DispatchBoard.tsx's route-order sort). This is a dispatcher-set
-- importance flag shown as a stand-out icon on the dispatch board.
--
-- Job-level default + per-visit override: a visit's own value wins when set;
-- null means "inherit the job's flag" (the common case for a recurring job's
-- generated visits).

alter table crm_jobs
  add column if not exists is_high_priority boolean not null default false;

alter table crm_job_visits
  add column if not exists is_high_priority boolean;

comment on column crm_jobs.is_high_priority is
  'Dispatcher-set "high priority" flag, shown as a stand-out icon on the dispatch board. Unrelated to crm_jobs.priority (route order).';
comment on column crm_job_visits.is_high_priority is
  'Per-visit override of crm_jobs.is_high_priority. Null inherits the job''s flag; true/false explicitly overrides it for this one visit.';
