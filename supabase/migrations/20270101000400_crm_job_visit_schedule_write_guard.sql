-- Visit schedule writes now need a scheduling key from an end-user session.
--
-- crm_job_visits RLS is org + has_crm_access(), so any CRM seat — including a
-- role with only "View Jobs" (job_view) — could create, move, re-crew, complete
-- or delete visits straight from the browser console, and the visit routes
-- counted job_view as a scheduling key. Owner decision (round 12): job_view is
-- view-only. Changing the schedule needs one of
--   sched_dispatch_board  Dispatch Board (also the Crew Board and calendar)
--   sched_waiting_list    Waiting List
--   snow_dispatch_manage  Snow Dispatch
--   job_add               Add Job (a job's own Visits tab, Add Job, Convert)
--   scheduling_settings   Settings → Schedules (re-generates jobs' visits)
-- and a project-type job's visits also accept sched_add_modify_projects (the
-- key that lets its holder create the project job — crm_jobs insert guard).
--
--  INSERT / hard DELETE        a scheduling key
--  UPDATE of a schedule column a scheduling key — scheduled_date, status,
--    deleted_at, crew_id, crew_unassigned, crew_group_id, crew_group_secondary,
--    job_id, client_id, job_service_id, occurrence_date, order_num, priority,
--    assigned_employee_id, storm_event_id, push_number.
--    A pure cancellation (status → cancelled and/or soft delete, unlinking the
--    occurrence) also passes with job_cancel, contract_edit or contract_delete:
--    cancelling a job (src/lib/visits/job-status-visits.ts) or a contract
--    (use-contracts) cancels / prunes its untouched visits.
--  UPDATE of rate_cents / qty  acct_add_modify_invoices — the key
--    enforce_crm_job_service_billing_write uses: they are what the visit bills.
--  Moving a multi-crew stop    refused (everyone, admins included) while any
--    other crew on the stop (same crew_group_id) is clocked in — the date move
--    carries every sibling (trg_crm_job_visits_group_follow_date) and would pull
--    the stop off that crew's list mid-stop.
--
-- Notes, invoice description, comments, skip reason, sub-status, hours, times,
-- crew size, chemical and snow fields are NOT gated here (labor, payroll and
-- chemical flows write them; the snow / clock columns have their own crew-only
-- guard a_crm_job_visits_crew_price_guard, 20270101000200).
--
-- Exempt, like every crm_roles guard (20261207000100): no end-user session
-- (service role: cron, /api/v1, Zapier, crew routes that write through the
-- service role), SECURITY DEFINER RPCs (invoiced-visit override, Min Days
-- override, price adjustment runs), and trigger cascades (pg_trigger_depth() >
-- 1, e.g. a multi-crew stop's siblings following the date). Crew logins
-- (my_role() = 'crew') are exempt too: the crew app has its own guards. Admins
-- pass every key inside has_settings_permission.
--
-- Apply to PROD only AFTER the matching code is deployed (job_view removed from
-- SCHEDULING_KEYS, Job Detail visit actions hidden without a key, the visit
-- sheet's Qty / Rate locked without the invoice key).

create or replace function public.enforce_crm_job_visit_schedule_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_job_ids uuid[];
  v_project boolean;
  v_can boolean;
begin
  if not public._crm_direct_user_write()
     or coalesce(public.my_role(), '') = 'crew' then
    return coalesce(new, old);
  end if;

  -- A multi-crew stop can't change day while another crew on it is clocked in.
  if tg_op = 'UPDATE'
     and new.scheduled_date is distinct from old.scheduled_date
     and new.crew_group_id is not null
     and exists (
       select 1
       from public.crm_job_visits s
       where s.crew_group_id = new.crew_group_id
         and s.id <> new.id
         and s.deleted_at is null
         and s.clocked_in_at is not null
         and s.clocked_out_at is null
         and s.status in ('scheduled', 'dispatched', 'in_progress')
     ) then
    raise exception 'Another crew on this multi-crew stop has clocked in, so the stop can''t be moved to another day. Have every crew on the stop clock out first.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
     and (new.rate_cents is distinct from old.rate_cents or new.qty is distinct from old.qty)
     and not public.has_settings_permission('acct_add_modify_invoices') then
    raise exception 'Only someone who can modify invoices can change a visit''s price or quantity'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_changed := array(
      select c
      from unnest(array[
        'scheduled_date', 'status', 'deleted_at', 'crew_id', 'crew_unassigned',
        'crew_group_id', 'crew_group_secondary', 'job_id', 'client_id',
        'job_service_id', 'occurrence_date', 'order_num', 'priority',
        'assigned_employee_id', 'storm_event_id', 'push_number'
      ]) c
      where v_old -> c is distinct from v_new -> c
    );
    if cardinality(v_changed) = 0 then
      return new;
    end if;
  end if;

  v_can := public._crm_has_any_permission(array[
    'sched_dispatch_board', 'sched_waiting_list', 'snow_dispatch_manage', 'job_add', 'scheduling_settings'
  ]);

  if not v_can then
    v_job_ids := case tg_op
      when 'INSERT' then array[new.job_id]
      when 'DELETE' then array[old.job_id]
      else array[new.job_id, old.job_id]
    end;
    select coalesce(bool_and(j.job_type = 'project'), false)
      into v_project
      from public.crm_jobs j
     where j.id = any (v_job_ids);
    v_can := v_project and public.has_settings_permission('sched_add_modify_projects');
  end if;

  -- Cancelling a job or a contract cancels / prunes its untouched visits.
  if not v_can
     and tg_op = 'UPDATE'
     and v_changed <@ array['status', 'deleted_at', 'occurrence_date', 'job_service_id']
     and (new.status is not distinct from old.status or new.status = 'cancelled')
     and (new.deleted_at is not distinct from old.deleted_at or new.deleted_at is not null)
     and (new.occurrence_date is not distinct from old.occurrence_date or new.occurrence_date is null)
     and (new.job_service_id is not distinct from old.job_service_id or new.job_service_id is null)
     and old.status <> 'completed' then
    v_can := public._crm_has_any_permission(array['job_cancel', 'contract_edit', 'contract_delete']);
  end if;

  if v_can then
    return coalesce(new, old);
  end if;

  raise exception 'You do not have permission to change the schedule'
    using errcode = '42501';
end;
$$;

revoke all on function public.enforce_crm_job_visit_schedule_write() from public, anon;
grant execute on function public.enforce_crm_job_visit_schedule_write() to authenticated, service_role;

drop trigger if exists a_crm_job_visits_enforce_schedule_write on public.crm_job_visits;
create trigger a_crm_job_visits_enforce_schedule_write
  before insert or update or delete on public.crm_job_visits
  for each row
  execute function public.enforce_crm_job_visit_schedule_write();
