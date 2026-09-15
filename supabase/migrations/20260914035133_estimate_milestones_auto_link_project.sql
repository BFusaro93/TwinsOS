-- A milestone added on an estimate that has ALREADY been converted never got
-- a project_id, and two things read that column.
--
-- MilestoneScheduleEditor is project-first: given a projectId it queries by
-- project and writes project_id; the estimate-side wrapper
-- (EstimateMilestonesEditor) has no projectId to give it, so every milestone
-- added from the Estimate screen is written with estimate_id only. That is
-- correct before conversion and wrong after it -- 20260913191000 backfilled
-- the link for everything already sold, but nothing maintains it for rows
-- created afterwards, and re-quoting or adding a stage to a live job is
-- ordinary work.
--
-- Measured on PROD (probe rolled back). A $40,000 project, converted from an
-- estimate, billed by two 50% milestones -- one converted (both ids), one
-- added afterwards from the Estimate screen (estimate_id only) -- then a
-- $20,000 change order:
--
--   * the project's Billing tab showed 1 of the 2 milestones;
--   * approve_change_order distributes across `project_id = ...` only, so the
--     whole $20,000 landed on the converted milestone: $40,000;
--   * create_invoice_from_milestone resolves the project through
--     estimate -> crm_jobs -> project for the BASIS regardless of the link, so
--     the unlinked 50% then billed 50% of the NEW $60,000: $30,000.
--
--   $70,000 billed against a $60,000 contract. The change order was charged
--   twice: once distributed, once re-percented.
--
-- The link belongs in the database rather than in the editor, because the
-- basis resolution that causes the double-count is already in the database and
-- uses this exact hop. Doing it here covers every writer -- the two editors,
-- the convert flow, the API, anything added later -- and cannot drift from the
-- rule create_invoice_from_milestone applies.

create or replace function public.fn_estimate_milestones_link_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is null and new.estimate_id is not null then
    select j.project_id into new.project_id
    from public.crm_jobs j
    where j.estimate_id = new.estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_estimate_milestones_link_project() from public, anon;

drop trigger if exists trg_estimate_milestones_link_project on public.estimate_milestones;
create trigger trg_estimate_milestones_link_project
  before insert or update of estimate_id, project_id on public.estimate_milestones
  for each row execute function public.fn_estimate_milestones_link_project();

-- Re-run 20260913191000's backfill: it only covered rows existing that day,
-- and the window between the two migrations is exactly when this could bite.
update public.estimate_milestones m
set project_id = j.project_id
from public.crm_jobs j
where j.estimate_id = m.estimate_id
  and j.project_id is not null
  and j.deleted_at is null
  and m.project_id is null
  and m.deleted_at is null;

-- The other half of the same hop: converting an estimate to a project has to
-- adopt the milestones the estimate already carries. The trigger above only
-- fires on the milestone; here the crm_jobs row is what appears.
create or replace function public.fn_crm_jobs_adopt_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null and new.estimate_id is not null then
    update public.estimate_milestones m
    set project_id = new.project_id
    where m.estimate_id = new.estimate_id
      and m.project_id is null
      and m.deleted_at is null;
  end if;
  return null;
end;
$$;

revoke execute on function public.fn_crm_jobs_adopt_milestones() from public, anon;

drop trigger if exists trg_crm_jobs_adopt_milestones on public.crm_jobs;
create trigger trg_crm_jobs_adopt_milestones
  after insert or update of project_id, estimate_id on public.crm_jobs
  for each row execute function public.fn_crm_jobs_adopt_milestones();
