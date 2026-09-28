-- Estimate → job conversion is now per LINE, not per estimate.
--
-- An estimate that mixes one-time lines (visits = 1) and recurring lines is
-- converted in passes: select the one-time lines → one-time job, then the
-- recurring lines → recurring job. The old "one estimate, one job" check
-- (crm_jobs.estimate_id already set → refuse) made the second pass
-- impossible, and it was a read-then-insert anyway, so two tabs could both
-- pass it.
--
--   * crm_job_services.estimate_line_item_id records which estimate line a
--     job service came from. A partial UNIQUE index makes it impossible for
--     one line to be converted twice, whatever the client does (two tabs,
--     a retried request) — the second insert fails with 23505.
--   * A soft-deleted job releases its lines (the trigger below nulls the
--     link), so deleting a mistaken job lets its lines be converted again.
--     crm_job_services has no deleted_at of its own; a hard-deleted service
--     row releases its line by disappearing.
--   * crm_job_services.max_visits carries the estimate line's visit count
--     onto a RECURRING job's service. The client priced N visits; the
--     service's per-visit rate is total / N, so the visit generator must stop
--     at N or it bills past what was sold. NULL = no cap (every service that
--     did not come from an estimate line). Wiring into the generator
--     (src/app/api/crm/jobs/generate-visits) is separate work.
--
-- estimate_versions(estimate_id, version_number) also gets the unique index
-- it always should have had: version numbers were count(*)+1, so two sends
-- racing produced two "v3" rows. Checked on PROD 2026-09-27: no duplicates.
-- The app now retries on conflict (src/lib/estimates/versions.ts).
--
-- Idempotent.

alter table public.crm_job_services
  add column if not exists estimate_line_item_id uuid
    references public.estimate_line_items(id) on delete set null;

alter table public.crm_job_services
  add column if not exists max_visits integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_job_services_max_visits_positive'
      and conrelid = 'public.crm_job_services'::regclass
  ) then
    alter table public.crm_job_services
      add constraint crm_job_services_max_visits_positive
      check (max_visits is null or max_visits > 0);
  end if;
end $$;

comment on column public.crm_job_services.estimate_line_item_id is
  'Estimate line this service was converted from. Unique where not null: a line converts to at most one live job service.';
comment on column public.crm_job_services.max_visits is
  'Visit cap for a recurring service converted from an estimate line (the line''s visit count). NULL = uncapped. The visit generator must not create more than this many visits for the service.';

create unique index if not exists crm_job_services_estimate_line_item_uniq
  on public.crm_job_services (estimate_line_item_id)
  where estimate_line_item_id is not null;

-- Backfill: link services of jobs already converted from an estimate to the
-- estimate line they came from, matched on (service_id, service_name) in
-- sort order, skipping lines that are lost/deleted or already linked. A
-- service that finds no match stays unlinked; the app treats an estimate
-- with a live job that has no linked services as converted wholesale
-- (legacy conversion), so nothing here can reopen a converted estimate.
do $$
declare
  s record;
  v_line uuid;
begin
  -- Machine backfill: keep it out of every job's audit trail.
  perform set_config('app.suppress_audit', 'true', true);
  for s in
    select js.id, js.service_id, js.service_name, j.estimate_id
      from public.crm_job_services js
      join public.crm_jobs j on j.id = js.job_id
     where j.estimate_id is not null
       and j.deleted_at is null
       and js.estimate_line_item_id is null
     order by j.created_at, js.sort_order, js.id
  loop
    select li.id into v_line
      from public.estimate_line_items li
     where li.estimate_id = s.estimate_id
       and li.deleted_at is null
       and coalesce(li.row_type, 'item') = 'item'
       and li.status <> 'lost'
       and li.service_id is not distinct from s.service_id
       and coalesce(li.service_name, '') = coalesce(s.service_name, '')
       and not exists (
         select 1 from public.crm_job_services x where x.estimate_line_item_id = li.id
       )
     order by li.sort_order, li.id
     limit 1;
    if v_line is not null then
      update public.crm_job_services set estimate_line_item_id = v_line where id = s.id;
    end if;
  end loop;
  perform set_config('app.suppress_audit', '', true);
end $$;

-- Releasing a deleted job's estimate lines.
create or replace function public.fn_crm_jobs_release_estimate_lines()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.crm_job_services
       set estimate_line_item_id = null
     where job_id = new.id
       and estimate_line_item_id is not null;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_crm_jobs_release_estimate_lines() from public, anon, authenticated;

drop trigger if exists trg_crm_jobs_release_estimate_lines on public.crm_jobs;
create trigger trg_crm_jobs_release_estimate_lines
  after update of deleted_at on public.crm_jobs
  for each row
  execute function public.fn_crm_jobs_release_estimate_lines();

-- Version numbers are unique per estimate.
create unique index if not exists estimate_versions_estimate_version_uniq
  on public.estimate_versions (estimate_id, version_number);
