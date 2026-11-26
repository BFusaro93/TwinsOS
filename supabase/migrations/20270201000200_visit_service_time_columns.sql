-- Per-service timing inside one stop.
--
-- A stop (same client/day/crew/address) clocks in and out once, so two services
-- at one property had the measured time divided by budget. Orgs can now turn on
-- organizations.customizations.crewServiceTiming: the crew taps Start / Finish
-- on each service (one at a time) and the stop's man-hours are split by each
-- service's own window instead.
--
-- service_started_at / service_ended_at are SEPARATE from clocked_in_at /
-- clocked_out_at on purpose: those stay the stop's clock (payroll punches and
-- recomputeStopLabor group siblings by an identical clocked_in_at).
--
-- Additive; safe before or after the deploy. New columns are auto-granted to
-- `authenticated` by grant_new_readable_columns. The crew view's column list is
-- frozen, so it is re-created with the three columns appended (create or replace
-- view keeps the crew_job(crm_crew_job_visits) dependency).

alter table public.crm_job_visits
  add column if not exists service_started_at timestamptz,
  add column if not exists service_ended_at timestamptz,
  add column if not exists service_gap_seconds integer not null default 0;

comment on column public.crm_job_visits.service_started_at is
  'When the crew started THIS service within its stop (crewServiceTiming). Null = not tracked; hours fall back to the budget split.';
comment on column public.crm_job_visits.service_gap_seconds is
  'Idle seconds between this service''s finish and a later Resume. Worked time = (ended - started) - gap, so a resumed service adds up every run.';
comment on column public.crm_job_visits.service_ended_at is
  'When the crew finished this service (or started the next one). Null while running or untracked.';

create or replace view public.crm_crew_job_visits
with (security_invoker = true) as
select
  v.id, v.org_id, v.job_id, v.client_id, v.crew_id, v.scheduled_date, v.start_time, v.end_time,
  v.status, v.completion_notes, v.actual_hours, v.completed_at, v.priority, v.notes_to_crew,
  v.created_at, v.updated_at, v.deleted_at, v.created_by, v.sub_status, v.order_num, v.men_count,
  v.qty,
  case
    when coalesce((select public.my_role()), '') <> 'crew'
      or not coalesce((select o.crew_hide_pricing from public.organizations o where o.id = v.org_id), false)
    then v.rate_cents
  end as rate_cents,
  v.notes_to_client, v.invoice_description, v.job_comments,
  v.assigned_employee_id, v.dispatched_at, v.clocked_in_at, v.clocked_out_at,
  v.acknowledged_notes_at, v.skip_reason, v.budgeted_hours, v.storm_event_id,
  v.snow_depth_inches, v.temperature, v.asset_type, v.materials_used, v.job_service_id,
  v.paused_at, v.break_minutes, v.is_high_priority, v.notes_to_crew_updated_at,
  v.occurrence_date, v.crew_unassigned, v.break_paid, v.chemical_confirmation_waived_at,
  v.chemical_confirmation_waived_by, v.crew_group_id, v.crew_group_secondary, v.push_number,
  v.bill_push, v.handed_off_from_crew_id,
  v.service_started_at, v.service_ended_at, v.service_gap_seconds
from public.crm_job_visits v;

revoke all on public.crm_crew_job_visits from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.crm_crew_job_visits from authenticated;
grant select on public.crm_crew_job_visits to authenticated, service_role;
