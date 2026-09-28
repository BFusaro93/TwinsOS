-- Guard completed + invoiced visits, and reopen a completed one-time job when
-- one of its visits is reopened.
--
-- 1. A visit that is completed AND carries a line on a live (not deleted,
--    not void) invoice can no longer have its status or scheduled_date
--    changed — un-completing or moving it would leave the invoice billing a
--    visit the schedule says didn't happen (or happened on another day). The
--    only way through is crm_override_invoiced_visit(), admin-only, which
--    sets the transaction-local GUC app.invoiced_visit_override.
-- 2. When a completed visit is reopened (status leaves completed for
--    scheduled / dispatched / in_progress), a one_time / waiting_list parent
--    job that the completion closed is reopened to 'scheduled' too, so the
--    visit isn't orphaned under a "completed" job that the dispatch board
--    hides.
--
-- Idempotent.

create or replace function public.crm_job_visits_guard_invoiced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'completed'
     and (new.status is distinct from old.status
          or new.scheduled_date is distinct from old.scheduled_date)
     and coalesce(current_setting('app.invoiced_visit_override', true), '') <> 'on'
     and exists (
       select 1
       from public.crm_invoice_line_items li
       join public.crm_invoices i on i.id = li.invoice_id
       where li.visit_id = old.id
         and i.deleted_at is null
         and i.status <> 'void'
     )
  then
    raise exception 'This visit is completed and already invoiced — void or edit the invoice first, or ask an admin to override.'
      using errcode = 'P0001', hint = 'invoiced_visit_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_job_visits_guard_invoiced on public.crm_job_visits;
create trigger trg_crm_job_visits_guard_invoiced
  before update of status, scheduled_date on public.crm_job_visits
  for each row execute function public.crm_job_visits_guard_invoiced();

create or replace function public.crm_job_visits_reopen_parent_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'completed'
     and new.status in ('scheduled', 'dispatched', 'in_progress')
     and new.deleted_at is null
  then
    update public.crm_jobs
       set status = 'scheduled',
           is_complete = false
     where id = new.job_id
       and org_id = new.org_id
       and job_type in ('one_time', 'waiting_list')
       and status = 'completed';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_crm_job_visits_reopen_parent_job on public.crm_job_visits;
create trigger trg_crm_job_visits_reopen_parent_job
  after update of status on public.crm_job_visits
  for each row execute function public.crm_job_visits_reopen_parent_job();

-- Trigger functions are not meant to be called directly.
revoke all on function public.crm_job_visits_guard_invoiced() from public, anon, authenticated;
revoke all on function public.crm_job_visits_reopen_parent_job() from public, anon, authenticated;

-- ── Admin override ──────────────────────────────────────────────────────────
-- SECURITY INVOKER: the UPDATE still runs under the caller's RLS, so this can
-- only touch visits of the caller's own org. The role check keeps it admin-only.
create or replace function public.crm_override_invoiced_visit(
  p_visit_id uuid,
  p_status text default null,
  p_scheduled_date date default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Only an admin can change an invoiced visit.' using errcode = '42501';
  end if;

  perform set_config('app.invoiced_visit_override', 'on', true);

  update public.crm_job_visits
     set status = coalesce(p_status, status),
         scheduled_date = coalesce(p_scheduled_date, scheduled_date),
         completed_at = case
           when p_status is not null and p_status <> 'completed' then null
           else completed_at
         end,
         updated_at = now()
   where id = p_visit_id
     and deleted_at is null;
  get diagnostics v_count = row_count;

  perform set_config('app.invoiced_visit_override', '', true);

  if v_count = 0 then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.crm_override_invoiced_visit(uuid, text, date) from public, anon;
grant execute on function public.crm_override_invoiced_visit(uuid, text, date) to authenticated;
