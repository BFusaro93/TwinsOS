-- Re-issue (2): a SKIPPED visit no longer counts as "scheduled" — a job whose only visits were
-- skipped is still waiting. (Original header follows.)
-- Waiting-list automation triggers ("Waiting list window is ending" / "Waiting list
-- window passed"), fired by the daily /api/cron/waiting-list-window. Their runs are
-- job-scoped, so they stop before the next step once the job is scheduled (any
-- non-cancelled visit), cancelled or deleted. Re-states the whole function: it is
-- replaced wholesale, so every earlier rule is carried over unchanged.
--
-- Idempotent. Apply BEFORE OR WITH the code deploy (old code never writes these triggers).

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
  v_job record;
  v_type text;
begin
  select e.trigger_type, e.invoice_id, e.estimate_id, e.ticket_id, e.client_id, e.visit_date, e.job_id
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

  -- Waiting-list window triggers: the reminder only applies while the job is still waiting.
  if v_enr.job_id is not null and v_type in ('waiting_list_ending', 'waiting_list_window_passed') then
    select j.status, j.deleted_at into v_job from public.crm_jobs j where j.id = v_enr.job_id;
    if not found or v_job.deleted_at is not null then
      return 'job was deleted';
    end if;
    if v_job.status = 'cancelled' then
      return 'job was cancelled';
    end if;
    if exists (select 1 from public.crm_job_visits v
                where v.job_id = v_enr.job_id
                  and v.deleted_at is null
                  and v.status not in ('cancelled', 'skipped')) then
      return 'job was scheduled';
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function public.sequence_enrollment_record_stop_reason(uuid) from public, anon, authenticated;
grant execute on function public.sequence_enrollment_record_stop_reason(uuid) to service_role;
