-- Bug sweep round 15b (area A), owner decision 5: more automation runs end on their own
-- when the thing they are about is no longer true. Extends
-- sequence_enrollment_record_stop_reason(), which the step processor (and the approval
-- route) call before EVERY step is sent — so a run stops at its next step at the latest:
--
--   visit_dispatched / visit_completed /           → stop when the client has no live
--   service_visit_completed / visit_date_changed      visit left on the run's visit_date
--                                                     (all cancelled, skipped, deleted or
--                                                     moved to another day / waiting list)
--   estimate_sent / estimate_no_response /         → stop when the estimate has an OPEN
--   estimate_expiring                                 client change request
--   invoice_past_due                               → stop when the invoice is no longer
--                                                     past due on the org's calendar (due
--                                                     date — or invoice date — moved out),
--                                                     the client's unapplied credit covers
--                                                     it, or a payment (ACH) is in flight
--   ticket_past_due                                → stop when the ticket is on hold or its
--                                                     due date was moved out / cleared
--
-- Everything the function already did is kept unchanged (void / paid / won / lost /
-- closed / deleted). Body starts from the CURRENT TEST definition. Not SECURITY DEFINER
-- (unchanged); EXECUTE stays service_role only (create or replace keeps the ACL).
-- The past-due rules mirror the crons: invoice-past-due (coalesce(due_date, invoice_date)
-- < org_today, crm_invoice_credit_available.covered, pending_payment_intent_id) and
-- ticket-past-due (status open/pending and due_date < org_today).
--
-- PROD: apply BEFORE or AFTER the code deploy (no code change depends on it).
-- PRE-CHECK: none (function replace only).

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
     and v_type in ('visit_dispatched', 'visit_completed', 'service_visit_completed', 'visit_date_changed')
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
