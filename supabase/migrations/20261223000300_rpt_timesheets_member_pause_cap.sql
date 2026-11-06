-- rpt_timesheets: a member's share of the stop's pause is capped at their time on the job.
--
-- The stop's pause (crm_job_visits.break_minutes) is a single minute total --
-- the pause intervals aren't stored -- and was deducted in full from EVERY
-- member's punch: someone who joined after a 30-minute lunch pause lost 30
-- minutes they worked, and a member who left at 4pm lost an overnight pause
-- (clock-out the next morning) down to 0 hours.
--
-- Same rule as the app (memberVisitPauseMinutes in src/lib/crew/visit-pause.ts,
-- used by sumPunchManHours / sumPunchLaborCents / payroll), so the Timesheet
-- total still equals the visit hours:
--   member pause = least(pause minutes, minutes the punch overlaps the visit's
--                  clocked_in_at -> clocked_out_at window)
-- each window edge falling back to the punch's own edge when the visit lacks it.
-- HOURS are always net of it; LABOR COST only when the pause is unpaid (the
-- visit's break_paid override, else organizations.customizations.crewBreaksUnpaid,
-- absent = unpaid) -- unchanged.
--
-- Built from the LIVE definition (20261120000000 added the "(deleted)" client
-- suffix and dropped the deleted_at filter on the client join). Column list,
-- names, order and types are unchanged, so CREATE OR REPLACE is enough;
-- security_invoker stays on.

create or replace view public.rpt_timesheets with (security_invoker = on) as
 SELECT t.id,
    (t.clocked_in_at AT TIME ZONE org_timezone(t.org_id))::date AS work_date,
    m.name AS member_name,
    cw.name AS crew_name,
        CASE
            WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)'::text
            ELSE c.display_name
        END AS client_name,
    v.status AS visit_status,
    t.clocked_in_at,
    t.clocked_out_at,
    t.break_minutes,
    t.lunch_minutes,
    calc.hours,
    m.labor_burden_cents_per_hour,
        CASE
            WHEN calc.paid_hours IS NOT NULL AND m.labor_burden_cents_per_hour IS NOT NULL THEN round(calc.paid_hours * m.labor_burden_cents_per_hour::numeric)::integer
            ELSE NULL::integer
        END AS labor_cost_cents
   FROM crm_crew_member_times t
     JOIN crm_crew_members m ON m.id = t.crew_member_id
     LEFT JOIN crm_crews cw ON cw.id = m.crew_id
     LEFT JOIN crm_job_visits v ON v.id = t.visit_id AND v.deleted_at IS NULL
     LEFT JOIN organizations o ON o.id = t.org_id
     LEFT JOIN clients c ON c.id = v.client_id
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN t.clocked_out_at IS NOT NULL THEN LEAST(
                        GREATEST(COALESCE(v.break_minutes, 0), 0)::numeric,
                        GREATEST(
                          EXTRACT(epoch FROM
                            LEAST(t.clocked_out_at, COALESCE(v.clocked_out_at, t.clocked_out_at))
                            - GREATEST(t.clocked_in_at, COALESCE(v.clocked_in_at, t.clocked_in_at))
                          ) / 60.0,
                          0::numeric))
                    ELSE 0::numeric
                END AS mins) pause
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN t.clocked_out_at IS NOT NULL THEN GREATEST(round(EXTRACT(epoch FROM t.clocked_out_at - t.clocked_in_at) / 3600.0 - COALESCE(t.break_minutes, 0)::numeric / 60.0 - COALESCE(t.lunch_minutes, 0)::numeric / 60.0 - pause.mins / 60.0, 2), 0::numeric)
                    ELSE NULL::numeric
                END AS hours,
                CASE
                    WHEN t.clocked_out_at IS NOT NULL THEN GREATEST(round(EXTRACT(epoch FROM t.clocked_out_at - t.clocked_in_at) / 3600.0 - COALESCE(t.break_minutes, 0)::numeric / 60.0 - COALESCE(t.lunch_minutes, 0)::numeric / 60.0 -
                    CASE
                        WHEN
                        CASE
                            WHEN v.break_paid IS NOT NULL THEN NOT v.break_paid
                            ELSE COALESCE(o.customizations ->> 'crewBreaksUnpaid'::text, 'true'::text) <> 'false'::text
                        END THEN pause.mins / 60.0
                        ELSE 0::numeric
                    END, 2), 0::numeric)
                    ELSE NULL::numeric
                END AS paid_hours) calc
  WHERE t.deleted_at IS NULL;
