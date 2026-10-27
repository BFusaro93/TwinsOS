-- rpt_timesheets ignored the stop's pause (crm_job_visits.break_minutes).
--
-- Pause/Resume (lunch, stopping for the day) writes its minutes onto the VISIT,
-- not onto each member's punch (crm_crew_member_times.break_minutes /
-- lunch_minutes are only the per-person entries). The view netted just the
-- per-person entries, so every member's punch kept the whole pause as worked
-- time: a 3-person crew that paused 30 minutes showed 1.5 man-hours too many on
-- the Timesheets report, Job Hours Summary, Crew Hours Summary and the KPI
-- overtime figure -- while Job Costing (rpt_job_visits / the visit's
-- actual_hours, recomputeStopLabor) already netted the pause. The app code
-- (sumPunchManHours in lib/crew/visit-labor.ts) documents that the visit's hours
-- must equal this report's total whenever punches exist.
--
-- Same rule as the app: HOURS are always net of the pause (time on site); LABOR
-- COST is net of the pause only when the pause is unpaid -- the visit's
-- break_paid override, else organizations.customizations.crewBreaksUnpaid
-- (absent = unpaid). Column list, names, order and types are unchanged, so
-- CREATE OR REPLACE is enough.

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
            WHEN ((calc.paid_hours IS NOT NULL) AND (m.labor_burden_cents_per_hour IS NOT NULL)) THEN (round((calc.paid_hours * (m.labor_burden_cents_per_hour)::numeric)))::integer
            ELSE NULL::integer
        END AS labor_cost_cents
   FROM ((((((crm_crew_member_times t
     JOIN crm_crew_members m ON ((m.id = t.crew_member_id)))
     LEFT JOIN crm_crews cw ON ((cw.id = m.crew_id)))
     LEFT JOIN crm_job_visits v ON (((v.id = t.visit_id) AND (v.deleted_at IS NULL))))
     LEFT JOIN organizations o ON ((o.id = t.org_id)))
     LEFT JOIN clients c ON (((c.id = v.client_id) AND (c.deleted_at IS NULL))))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)) - ((GREATEST(COALESCE(v.break_minutes, 0), 0))::numeric / 60.0), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS hours,
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)) - (
                        CASE
                            WHEN (CASE WHEN (v.break_paid IS NOT NULL) THEN (NOT v.break_paid) ELSE (COALESCE((o.customizations ->> 'crewBreaksUnpaid'::text), 'true'::text) <> 'false'::text) END)
                            THEN ((GREATEST(COALESCE(v.break_minutes, 0), 0))::numeric / 60.0)
                            ELSE 0::numeric
                        END), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS paid_hours) calc)
  WHERE (t.deleted_at IS NULL);
