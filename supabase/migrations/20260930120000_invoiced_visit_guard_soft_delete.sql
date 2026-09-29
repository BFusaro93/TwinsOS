-- Extend the invoiced-visit lock (20260927110100_invoiced_visit_guard.sql) to
-- soft deletes.
--
-- trg_crm_job_visits_guard_invoiced only fired on UPDATE OF status,
-- scheduled_date, so a completed + invoiced visit could still be trashed
-- (deleted_at set) from the job panel — the invoice then billed a visit that
-- no longer exists anywhere on the schedule. The trigger now also fires on
-- deleted_at and refuses the NULL → NOT NULL transition under the same
-- completed + live-invoice-line condition and the same
-- app.invoiced_visit_override escape hatch.
--
-- The function is re-stated from its only prior definition
-- (20260927110100); the status / scheduled_date check is unchanged.
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
          or new.scheduled_date is distinct from old.scheduled_date
          or (old.deleted_at is null and new.deleted_at is not null))
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
  before update of status, scheduled_date, deleted_at on public.crm_job_visits
  for each row execute function public.crm_job_visits_guard_invoiced();

-- Trigger functions are not meant to be called directly.
revoke all on function public.crm_job_visits_guard_invoiced() from public, anon, authenticated;
