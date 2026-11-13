-- Snow: a return trip on a once-per-storm job can be billed.
--
-- Push 2+ on a flat Per Event job was recorded at $0 (the storm is one charge).
-- But a second application is sometimes a real charge — e.g. a second salting by
-- another crew. bill_push marks such a push as its own charge (the job's flat
-- rate again) instead of folding into the storm's single charge. Default false
-- keeps extras no-charge. Per Event, Per Inch return trips are always part of the
-- event (their depth counts toward the deepest reading); Per Push / Hourly bill
-- every visit — both ignore this flag.

alter table public.crm_job_visits
  add column if not exists bill_push boolean not null default false;

comment on column public.crm_job_visits.bill_push is
  'Snow: push 2+ on a flat Per Event job is billed as its own charge (true) or recorded at no charge (false, default). Ignored on other billing types.';
