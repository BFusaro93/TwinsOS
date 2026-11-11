-- Automation runs tied to one invoice / estimate / ticket now end on their own once
-- that record has left the state the run's start trigger implies:
--
--   invoice_created / invoice_sent / invoice_past_due  → stop when the invoice is paid
--                                                        in full, voided or deleted
--   invoice_paid                                       → stop only when voided or deleted
--   estimate_created / estimate_sent /
--   estimate_expiring / estimate_no_response           → stop when won, lost or deleted
--   estimate_won / estimate_lost                       → stop only when deleted
--   ticket_created / ticket_past_due / ticket_reopened → stop when closed or deleted
--   ticket_closed                                      → stop only when deleted
--   anything else / unknown (older runs)               → stop only when the record is
--                                                        voided (invoice) or deleted
--
-- A run is never stopped by the very transition that started it: the "terminal"
-- triggers (paid / won / lost / closed) only stop on void or delete.
--
-- Before this, a "your invoice is due" reminder kept going after the customer paid,
-- and an estimate follow-up kept chasing a client who had already accepted.
--
-- Pieces:
--   * crm_sequence_enrollments.trigger_type — which start trigger created the run
--     (written by the app from now on; backfilled below for existing runs).
--   * crm_sequence_enrollments.stop_reason  — why a run was stopped (shown in logs).
--   * crm_sequence_step_approvals.decision_reason — why the system rejected a queued
--     step (users still only change status/decided_by/decided_at — see
--     enforce_sequence_step_approval_write, untouched here).
--   * sequence_enrollment_record_stop_reason(enrollment) — the rule above; also
--     called by the step processor and the approval route before anything is sent.
--   * Triggers on crm_invoices / estimates / crm_tickets stop matching runs the moment
--     the record changes, so they drop out of the queue immediately.
--   * A trigger on crm_sequence_enrollments rejects (as the system) any pending
--     approval of a run that ended, so the approval queue only shows live steps.
--   * Turning an automation or sequence off (or deleting it) stops its runs that are
--     parked waiting for approval — the processor never revisits a parked run, so
--     before this they sat in the queue forever.

alter table public.crm_sequence_enrollments
  add column if not exists trigger_type text,
  add column if not exists stop_reason text;

alter table public.crm_sequence_step_approvals
  add column if not exists decision_reason text;

-- ── The rule ────────────────────────────────────────────────────────────────
create or replace function public.sequence_enrollment_record_stop_reason(p_enrollment_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_enr record;
  v_inv record;
  v_est record;
  v_tkt record;
  v_type text;
begin
  select e.trigger_type, e.invoice_id, e.estimate_id, e.ticket_id
    into v_enr
    from public.crm_sequence_enrollments e
   where e.id = p_enrollment_id;
  if not found then
    return null;
  end if;
  v_type := coalesce(v_enr.trigger_type, '');

  if v_enr.invoice_id is not null then
    select i.status, i.deleted_at into v_inv from public.crm_invoices i where i.id = v_enr.invoice_id;
    if not found or v_inv.deleted_at is not null then
      return 'invoice was deleted';
    end if;
    if v_inv.status = 'void' then
      return 'invoice was voided';
    end if;
    if v_inv.status = 'paid' and v_type in ('invoice_created', 'invoice_sent', 'invoice_past_due') then
      return 'invoice was paid in full';
    end if;
  end if;

  if v_enr.estimate_id is not null then
    select s.stage, s.deleted_at into v_est from public.estimates s where s.id = v_enr.estimate_id;
    if not found or v_est.deleted_at is not null then
      return 'estimate was deleted';
    end if;
    if v_type in ('estimate_created', 'estimate_sent', 'estimate_expiring', 'estimate_no_response') then
      if v_est.stage in ('accepted', 'invoiced') then
        return 'estimate was won';
      end if;
      if v_est.stage = 'lost' then
        return 'estimate was lost';
      end if;
    end if;
  end if;

  if v_enr.ticket_id is not null then
    select t.status, t.deleted_at into v_tkt from public.crm_tickets t where t.id = v_enr.ticket_id;
    if not found or v_tkt.deleted_at is not null then
      return 'ticket was deleted';
    end if;
    if v_tkt.status = 'closed' and v_type in ('ticket_created', 'ticket_past_due', 'ticket_reopened') then
      return 'ticket was closed';
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.sequence_enrollment_record_stop_reason(uuid) from public, anon, authenticated;
grant execute on function public.sequence_enrollment_record_stop_reason(uuid) to service_role;

-- ── Stop every live run scoped to one record that the rule says is over ─────
create or replace function public.stop_record_scoped_enrollments(
  p_invoice_id uuid default null,
  p_estimate_id uuid default null,
  p_ticket_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_reason text;
  v_n integer := 0;
begin
  if p_invoice_id is null and p_estimate_id is null and p_ticket_id is null then
    return 0;
  end if;
  for v_row in
    select e.id, e.org_id, e.sequence_id, e.client_id
      from public.crm_sequence_enrollments e
     where e.completed_at is null
       and e.stopped_at is null
       and e.deleted_at is null
       and (   (p_invoice_id  is not null and e.invoice_id  = p_invoice_id)
            or (p_estimate_id is not null and e.estimate_id = p_estimate_id)
            or (p_ticket_id   is not null and e.ticket_id   = p_ticket_id))
  loop
    v_reason := public.sequence_enrollment_record_stop_reason(v_row.id);
    continue when v_reason is null;
    update public.crm_sequence_enrollments
       set stopped_at = now(), stop_reason = v_reason, awaiting_approval = false, updated_at = now()
     where id = v_row.id
       and completed_at is null
       and stopped_at is null;
    if found then
      insert into public.crm_sequence_execution_log (org_id, enrollment_id, sequence_id, client_id, action, detail)
      values (v_row.org_id, v_row.id, v_row.sequence_id, v_row.client_id, 'stopped_record_changed', v_reason);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.stop_record_scoped_enrollments(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.stop_record_scoped_enrollments(uuid, uuid, uuid) to service_role;

create or replace function public.stop_enrollments_on_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'crm_invoices' then
    perform public.stop_record_scoped_enrollments(p_invoice_id => new.id);
  elsif tg_table_name = 'estimates' then
    perform public.stop_record_scoped_enrollments(p_estimate_id => new.id);
  elsif tg_table_name = 'crm_tickets' then
    perform public.stop_record_scoped_enrollments(p_ticket_id => new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.stop_enrollments_on_record_change() from public, anon, authenticated;

-- No column list on purpose: a status written by a BEFORE trigger (or a
-- reconcile RPC) must still be seen; the WHEN clause keeps it cheap.
drop trigger if exists trg_crm_invoices_stop_enrollments on public.crm_invoices;
create trigger trg_crm_invoices_stop_enrollments
  after update on public.crm_invoices
  for each row
  when (
    (new.status is distinct from old.status and new.status in ('paid', 'void'))
    or (new.deleted_at is not null and old.deleted_at is null)
  )
  execute function public.stop_enrollments_on_record_change();

drop trigger if exists trg_estimates_stop_enrollments on public.estimates;
create trigger trg_estimates_stop_enrollments
  after update on public.estimates
  for each row
  when (
    (new.stage is distinct from old.stage and new.stage in ('accepted', 'invoiced', 'lost'))
    or (new.deleted_at is not null and old.deleted_at is null)
  )
  execute function public.stop_enrollments_on_record_change();

drop trigger if exists trg_crm_tickets_stop_enrollments on public.crm_tickets;
create trigger trg_crm_tickets_stop_enrollments
  after update on public.crm_tickets
  for each row
  when (
    (new.status is distinct from old.status and new.status = 'closed')
    or (new.deleted_at is not null and old.deleted_at is null)
  )
  execute function public.stop_enrollments_on_record_change();

-- ── A run that ended takes its queued approval with it ──────────────────────
create or replace function public.reject_pending_approvals_on_enrollment_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.crm_sequence_step_approvals
     set status = 'rejected',
         decided_by = null,
         decided_at = now(),
         decision_reason = coalesce(
           new.stop_reason,
           case when new.completed_at is not null and old.completed_at is null
                then 'the automation run finished'
                else 'the automation run was stopped' end)
   where enrollment_id = new.id
     and status = 'pending';
  return null;
end;
$$;

revoke all on function public.reject_pending_approvals_on_enrollment_end() from public, anon, authenticated;

drop trigger if exists trg_crm_sequence_enrollments_reject_approvals on public.crm_sequence_enrollments;
create trigger trg_crm_sequence_enrollments_reject_approvals
  after update on public.crm_sequence_enrollments
  for each row
  when (
    (new.stopped_at is not null and old.stopped_at is null)
    or (new.completed_at is not null and old.completed_at is null)
    or (new.deleted_at is not null and old.deleted_at is null)
  )
  execute function public.reject_pending_approvals_on_enrollment_end();

-- ── Turning an automation / sequence off releases its parked runs ──────────
create or replace function public.stop_parked_enrollments_on_automation_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := case when new.deleted_at is not null and old.deleted_at is null
                        then 'automation was deleted' else 'automation was turned off' end;
begin
  if tg_table_name = 'crm_automations' then
    update public.crm_sequence_enrollments e
       set stopped_at = now(), stop_reason = v_reason, awaiting_approval = false, updated_at = now()
      from public.crm_automation_sequences s
     where s.id = e.sequence_id
       and s.automation_id = new.id
       and e.awaiting_approval
       and e.completed_at is null
       and e.stopped_at is null;
  else
    update public.crm_sequence_enrollments e
       set stopped_at = now(), stop_reason = v_reason, awaiting_approval = false, updated_at = now()
     where e.sequence_id = new.id
       and e.awaiting_approval
       and e.completed_at is null
       and e.stopped_at is null;
  end if;
  return null;
end;
$$;

revoke all on function public.stop_parked_enrollments_on_automation_off() from public, anon, authenticated;

drop trigger if exists trg_crm_automations_stop_parked_enrollments on public.crm_automations;
create trigger trg_crm_automations_stop_parked_enrollments
  after update on public.crm_automations
  for each row
  when (
    (old.is_active is distinct from false and new.is_active = false)
    or (new.deleted_at is not null and old.deleted_at is null)
  )
  execute function public.stop_parked_enrollments_on_automation_off();

drop trigger if exists trg_crm_automation_sequences_stop_parked_enrollments on public.crm_automation_sequences;
create trigger trg_crm_automation_sequences_stop_parked_enrollments
  after update on public.crm_automation_sequences
  for each row
  when (
    (old.is_active is distinct from false and new.is_active = false)
    or (new.deleted_at is not null and old.deleted_at is null)
  )
  execute function public.stop_parked_enrollments_on_automation_off();

-- ── Backfill + one-time sweep ───────────────────────────────────────────────
-- Existing record-scoped runs get the start trigger their sequence offers for that
-- record kind. Where a sequence has both an "open" and a "terminal" trigger of the
-- same kind, the terminal one is assumed (it only stops on void/delete — the
-- cautious choice).
update public.crm_sequence_enrollments e
   set trigger_type = pick.trigger_type
  from (
    select e2.id,
           case
             when e2.invoice_id is not null then (
               select case when bool_or(t.trigger_type = 'invoice_paid') then 'invoice_paid' else min(t.trigger_type) end
                 from public.crm_sequence_triggers t
                where t.sequence_id = e2.sequence_id and t.trigger_type like 'invoice\_%')
             when e2.estimate_id is not null then (
               select coalesce(min(t.trigger_type) filter (where t.trigger_type in ('estimate_won', 'estimate_lost')), min(t.trigger_type))
                 from public.crm_sequence_triggers t
                where t.sequence_id = e2.sequence_id and t.trigger_type like 'estimate\_%')
             when e2.ticket_id is not null then (
               select case when bool_or(t.trigger_type = 'ticket_closed') then 'ticket_closed' else min(t.trigger_type) end
                 from public.crm_sequence_triggers t
                where t.sequence_id = e2.sequence_id and t.trigger_type like 'ticket\_%')
           end as trigger_type
      from public.crm_sequence_enrollments e2
     where e2.trigger_type is null
       and (e2.invoice_id is not null or e2.estimate_id is not null or e2.ticket_id is not null)
  ) pick
 where pick.id = e.id
   and pick.trigger_type is not null;

-- Runs whose record already left that state end now rather than at their next step.
do $$
declare
  v_row record;
begin
  for v_row in
    select distinct invoice_id, estimate_id, ticket_id
      from public.crm_sequence_enrollments
     where completed_at is null and stopped_at is null and deleted_at is null
       and (invoice_id is not null or estimate_id is not null or ticket_id is not null)
  loop
    perform public.stop_record_scoped_enrollments(v_row.invoice_id, v_row.estimate_id, v_row.ticket_id);
  end loop;
end;
$$;

-- Queued approvals whose run already ended (stopped by an older path that left
-- them pending) leave the queue.
update public.crm_sequence_step_approvals a
   set status = 'rejected',
       decided_by = null,
       decided_at = now(),
       decision_reason = coalesce(e.stop_reason, 'the automation run had already ended')
  from public.crm_sequence_enrollments e
 where e.id = a.enrollment_id
   and a.status = 'pending'
   and (e.stopped_at is not null or e.completed_at is not null or e.deleted_at is not null);
