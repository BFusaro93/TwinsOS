-- Round 15 open items (automations).
--
-- 1. Job-scoped runs are once per job PER START TRIGGER. A sequence started by both
--    "Job was created" and "Job was cancelled" had the creation run block the same
--    job's cancellation run (the active-job index was (sequence_id, job_id)). The index
--    now includes trigger_type, coalesced like the visit-day index, so older rows
--    without one keep colliding with each other as before. isEligibleForEnrollment
--    filters the same way.
--
-- 2. New "Visit is coming up" trigger (visit_coming_up), fired by the daily
--    /api/cron/visit-coming-up for visits N days out. Its runs are visit-day runs, so
--    they get the same auto-stop as the other visit triggers: when no live visit
--    (anything but cancelled / skipped) is left for the client on that day — a
--    rain-out, a cancel, a move to another day — the run stops before its next step.
--
-- All idempotent. PROD: apply BEFORE OR WITH the code deploy (old code never writes
-- visit_coming_up, and the index only adds a column, so nothing existing can violate it).

drop index if exists public.crm_sequence_enrollments_active_job_uidx;
create unique index crm_sequence_enrollments_active_job_uidx
  on public.crm_sequence_enrollments (sequence_id, job_id, (coalesce(trigger_type, '')))
  where job_id is not null and completed_at is null and stopped_at is null and deleted_at is null;

create or replace function public.sequence_enrollment_record_stop_reason(p_enrollment_id uuid)
 returns text
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_enr record;
  v_inv record;
  v_est record;
  v_tkt record;
  v_type text;
begin
  select e.trigger_type, e.invoice_id, e.estimate_id, e.ticket_id, e.client_id, e.visit_date
    into v_enr
    from public.crm_sequence_enrollments e
   where e.id = p_enrollment_id;
  if not found then
    return null;
  end if;
  v_type := coalesce(v_enr.trigger_type, '');

  if v_enr.invoice_id is not null then
    select i.status, i.deleted_at, i.org_id, i.due_date, i.invoice_date, i.pending_payment_intent_id
      into v_inv from public.crm_invoices i where i.id = v_enr.invoice_id;
    if not found or v_inv.deleted_at is not null then
      return 'invoice was deleted';
    end if;
    if v_inv.status = 'void' then
      return 'invoice was voided';
    end if;
    if v_inv.status = 'paid' and v_type in ('invoice_created', 'invoice_sent', 'invoice_past_due') then
      return 'invoice was paid in full';
    end if;
    if v_type = 'invoice_past_due' then
      if coalesce(v_inv.due_date, v_inv.invoice_date) is null
         or coalesce(v_inv.due_date, v_inv.invoice_date) >= public.org_today(v_inv.org_id) then
        return 'invoice is no longer past due';
      end if;
      if v_inv.pending_payment_intent_id is not null then
        return 'a payment for the invoice is pending';
      end if;
      if coalesce((select c.covered from public.crm_invoice_credit_available(array[v_enr.invoice_id]) c limit 1), false) then
        return 'account credit covers the invoice';
      end if;
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
    if v_type in ('estimate_sent', 'estimate_expiring', 'estimate_no_response')
       and exists (select 1 from public.estimate_change_requests r
                    where r.estimate_id = v_enr.estimate_id and r.status = 'open') then
      return 'client requested changes to the estimate';
    end if;
  end if;

  if v_enr.ticket_id is not null then
    select t.status, t.deleted_at, t.org_id, t.due_date into v_tkt from public.crm_tickets t where t.id = v_enr.ticket_id;
    if not found or v_tkt.deleted_at is not null then
      return 'ticket was deleted';
    end if;
    if v_tkt.status = 'closed' and v_type in ('ticket_created', 'ticket_past_due', 'ticket_reopened') then
      return 'ticket was closed';
    end if;
    if v_type = 'ticket_past_due' then
      if v_tkt.status = 'on_hold' then
        return 'ticket is on hold';
      end if;
      if v_tkt.due_date is null or v_tkt.due_date >= public.org_today(v_tkt.org_id) then
        return 'ticket is no longer past due';
      end if;
    end if;
  end if;

  if v_enr.visit_date is not null
     and v_type in ('visit_dispatched', 'visit_coming_up', 'visit_completed', 'service_visit_completed', 'visit_date_changed')
     and not exists (select 1 from public.crm_job_visits v
                      where v.client_id = v_enr.client_id
                        and v.scheduled_date = v_enr.visit_date
                        and v.deleted_at is null
                        and v.status not in ('cancelled', 'skipped')) then
    return 'no visit is left on that day';
  end if;

  return null;
end;
$function$;

revoke all on function public.sequence_enrollment_record_stop_reason(uuid) from public, anon, authenticated;
grant execute on function public.sequence_enrollment_record_stop_reason(uuid) to service_role;
