-- crm_crew_member_times: soft delete instead of hard delete.
--
-- DELETE /api/crm/crew/visits/[visitId]/member-times hard-deleted payroll
-- punches (and had no ownership check — fixed in the route). Per the repo's
-- soft-delete rule it now stamps deleted_at; the (visit_id, crew_member_id)
-- unique constraint is kept, and the route's upsert clears deleted_at so
-- re-adding a removed member revives the same row.
--
-- Readers updated to exclude soft-deleted punches: the member-times route,
-- useCrewMemberTimes/useCrewMemberTimesForDate, both crew clock-out labor-cost
-- rollups, and rpt_timesheets (below).

alter table public.crm_crew_member_times
  add column if not exists deleted_at timestamptz;

create index if not exists crm_crew_member_times_visit_live_idx
  on public.crm_crew_member_times (visit_id)
  where deleted_at is null;

-- rpt_timesheets: restated from its latest definition
-- (20260927130400_rpt_views_org_timezone.sql) with only the
-- `WHERE t.deleted_at IS NULL` added. Column list, names, order and types are
-- identical, so CREATE OR REPLACE is enough.
create or replace view public.rpt_timesheets with (security_invoker = on) as
 SELECT t.id,
    ((t.clocked_in_at AT TIME ZONE public.org_timezone(t.org_id)))::date AS work_date,
    m.name AS member_name,
    cw.name AS crew_name,
    c.display_name AS client_name,
    v.status AS visit_status,
    t.clocked_in_at,
    t.clocked_out_at,
    t.break_minutes,
    t.lunch_minutes,
    calc.hours,
    m.labor_burden_cents_per_hour,
        CASE
            WHEN ((calc.hours IS NOT NULL) AND (m.labor_burden_cents_per_hour IS NOT NULL)) THEN (round((calc.hours * (m.labor_burden_cents_per_hour)::numeric)))::integer
            ELSE NULL::integer
        END AS labor_cost_cents
   FROM (((((crm_crew_member_times t
     JOIN crm_crew_members m ON ((m.id = t.crew_member_id)))
     LEFT JOIN crm_crews cw ON ((cw.id = m.crew_id)))
     LEFT JOIN crm_job_visits v ON (((v.id = t.visit_id) AND (v.deleted_at IS NULL))))
     LEFT JOIN clients c ON (((c.id = v.client_id) AND (c.deleted_at IS NULL))))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS hours) calc)
  WHERE (t.deleted_at IS NULL);
