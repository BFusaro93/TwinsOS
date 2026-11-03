-- Package job renewal ("Renew for next season").
--
-- A renewal is a NEW package job created from last season's job (same client,
-- property, services, rates and crew; step dates moved forward a year). The
-- new job records where it came from in renewed_from_job_id, which is what the
-- Package Renewal report and the job detail read to show "Renewed".
--
--  * One live renewal per source job: the partial unique index makes a second
--    renewal of the same job (double click, two people, bulk + single) fail
--    instead of silently creating a duplicate season. Soft-deleting the
--    renewal frees the source to be renewed again.
--  * The source must be a live package job in the caller's own org. The check
--    runs as the caller (security invoker), so RLS also hides other orgs'
--    jobs from it.
--  * package_renewal, never written by any UI until now, becomes the job's
--    renewal setting: NULL = renew as usual, 'do_not_renew' = the client is
--    not coming back; the bulk renewal leaves it out and the report says so.

alter table public.crm_jobs
  add column if not exists renewed_from_job_id uuid
    references public.crm_jobs(id) on delete set null;

comment on column public.crm_jobs.renewed_from_job_id is
  'Package renewal: the previous season''s package job this job was renewed from.';

create unique index if not exists crm_jobs_renewed_from_live_uidx
  on public.crm_jobs (renewed_from_job_id)
  where renewed_from_job_id is not null and deleted_at is null;

-- package_renewal was free text with no writer; every row is NULL on TEST.
-- Anything else (hand-entered SQL) is cleared rather than failing the check.
update public.crm_jobs
   set package_renewal = null
 where package_renewal is not null
   and package_renewal <> 'do_not_renew';

alter table public.crm_jobs
  drop constraint if exists crm_jobs_package_renewal_check;
alter table public.crm_jobs
  add constraint crm_jobs_package_renewal_check
  check (package_renewal is null or package_renewal = 'do_not_renew');

comment on column public.crm_jobs.package_renewal is
  'Package renewal setting: NULL = renew next season as usual; ''do_not_renew'' = client is not renewing.';

create or replace function public.check_crm_job_renewed_from()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.renewed_from_job_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.renewed_from_job_id is not distinct from old.renewed_from_job_id then
    return new;
  end if;
  if new.renewed_from_job_id = new.id then
    raise exception 'A job cannot be a renewal of itself' using errcode = '23514';
  end if;
  if new.job_type <> 'package' then
    raise exception 'Only package jobs can be renewals' using errcode = '23514';
  end if;
  if not exists (
    select 1
      from public.crm_jobs src
     where src.id = new.renewed_from_job_id
       and src.org_id = new.org_id
       and src.job_type = 'package'
       and src.deleted_at is null
  ) then
    raise exception 'The job being renewed was not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_jobs_check_renewed_from on public.crm_jobs;
create trigger trg_crm_jobs_check_renewed_from
  before insert or update of renewed_from_job_id on public.crm_jobs
  for each row execute function public.check_crm_job_renewed_from();

revoke execute on function public.check_crm_job_renewed_from() from anon;
