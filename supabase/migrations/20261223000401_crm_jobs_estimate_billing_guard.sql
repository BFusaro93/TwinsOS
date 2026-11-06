-- Converting an estimate to a job when the estimate already bills on its own
-- double-bills the client:
--   * an invoice created from the estimate (Create Invoice, or a milestone
--     invoice from create_invoice_from_milestone) carries estimate_id, and a
--     converted one-time / recurring / waiting-list / snow job then invoices
--     the same services again as its visits complete;
--   * a milestone-billed estimate (payment_plan_type = 'milestones') is
--     invoiced through its milestones, so a regular job's visit invoices are
--     a second bill for the same work.
-- Project jobs are never auto-invoiced on visit completion and adopt the
-- estimate's milestones (fn_crm_jobs_adopt_milestones), so those conversions
-- stay allowed. The convert dialog forces Project in both cases; this is the
-- server-side half for every other writer (API, a second tab, a stale dialog).
--
-- Fires only when a job is linked to an estimate (insert, or estimate_id /
-- job_type actually changing), so editing existing jobs is unaffected.

create or replace function public.fn_crm_jobs_estimate_billing_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_invoice_number text;
  v_has_invoice boolean := false;
begin
  if new.estimate_id is null
     or new.deleted_at is not null
     or new.job_type = 'project' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.estimate_id is not distinct from old.estimate_id
     and new.job_type is not distinct from old.job_type then
    return new;
  end if;

  select e.payment_plan_type into v_plan
  from public.estimates e
  where e.id = new.estimate_id;

  select true, i.invoice_number::text into v_has_invoice, v_invoice_number
  from public.crm_invoices i
  where i.estimate_id = new.estimate_id
    and i.deleted_at is null
    and i.status <> 'void'
  order by i.created_at
  limit 1;

  if coalesce(v_has_invoice, false) then
    raise exception 'This estimate has already been invoiced (%) — convert it as a Project (project jobs aren''t invoiced per visit), or void the invoice first.',
      coalesce('#' || v_invoice_number, 'a draft invoice')
      using errcode = 'P0001';
  end if;

  if v_plan = 'milestones' then
    raise exception 'This estimate bills by milestones — convert it as a Project so the milestones carry over and its visits aren''t invoiced separately.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_crm_jobs_estimate_billing_guard() from public, anon;

drop trigger if exists trg_crm_jobs_estimate_billing_guard on public.crm_jobs;
create trigger trg_crm_jobs_estimate_billing_guard
  before insert or update of estimate_id, job_type on public.crm_jobs
  for each row execute function public.fn_crm_jobs_estimate_billing_guard();
