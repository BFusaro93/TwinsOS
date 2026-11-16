-- rpt_timesheets: the punch's PAYROLL day, and who the person is.
--
-- work_date was the punch's local calendar date, so a punch after midnight on
-- a shift that started the evening before landed on the next day in the
-- Report Center while Payroll (payroll_punch_work_date / payrollPunchDate) put
-- it on the shift's day. It now uses payroll_punch_work_date — computed once
-- per row and shared with the shift-break lookup that already used it.
--
-- New trailing columns: employee_id (crm_crew_members.employee_id) and
-- crew_member_id, so per-person figures (the KPI Scorecard's overtime %) count
-- one person once even when they've belonged to more than one crew.
--
-- Safe BEFORE the deploy: existing columns keep their names, order and types.

create or replace view public.rpt_timesheets with (security_invoker = on) as
 SELECT t.id,
    pd.work_date,
    m.name AS member_name,
    cw.name AS crew_name,
        CASE
            WHEN (c.deleted_at IS NOT NULL) THEN (c.display_name || ' (deleted)'::text)
            ELSE c.display_name
        END AS client_name,
    v.status AS visit_status,
    t.clocked_in_at,
    t.clocked_out_at,
    t.break_minutes,
    t.lunch_minutes,
    calc.hours,
    rates.rate_cents AS labor_burden_cents_per_hour,
        CASE
            WHEN ((calc.paid_hours IS NOT NULL) AND (rates.rate_cents IS NOT NULL)) THEN (round((calc.paid_hours * (rates.rate_cents)::numeric)))::integer
            ELSE NULL::integer
        END AS labor_cost_cents,
    t.org_id,
    m.employee_id,
    t.crew_member_id
   FROM ((((((((((crm_crew_member_times t
     JOIN crm_crew_members m ON ((m.id = t.crew_member_id)))
     LEFT JOIN crm_crews cw ON ((cw.id = m.crew_id)))
     LEFT JOIN crm_job_visits v ON (((v.id = t.visit_id) AND (v.deleted_at IS NULL))))
     LEFT JOIN organizations o ON ((o.id = t.org_id)))
     LEFT JOIN clients c ON ((c.id = v.client_id)))
     LEFT JOIN crm_crew_member_labor_rates() rates(crew_member_id, labor_burden_cents_per_hour, rate_cents) ON ((rates.crew_member_id = t.crew_member_id)))
     CROSS JOIN LATERAL ( SELECT payroll_punch_work_date(t.org_id, t.crew_member_id, t.clocked_in_at) AS work_date) pd)
     LEFT JOIN LATERAL ( SELECT s.breaks_unpaid
           FROM crm_crew_day_shifts s
          WHERE ((t.clocked_in_at IS NOT NULL) AND (s.crew_member_id = t.crew_member_id) AND (s.deleted_at IS NULL) AND (s.work_date = pd.work_date))
         LIMIT 1) sh ON (true))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN LEAST((GREATEST(COALESCE(v.break_minutes, 0), 0))::numeric, GREATEST((EXTRACT(epoch FROM (LEAST(t.clocked_out_at, COALESCE(v.clocked_out_at, t.clocked_out_at)) - GREATEST(t.clocked_in_at, COALESCE(v.clocked_in_at, t.clocked_in_at)))) / 60.0), (0)::numeric))
                    ELSE (0)::numeric
                END AS mins) pause)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round(((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)) - (pause.mins / 60.0)), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS hours,
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round(((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)) -
                    CASE
                        WHEN
                        CASE
                            WHEN (v.break_paid IS NOT NULL) THEN (NOT v.break_paid)
                            ELSE COALESCE(sh.breaks_unpaid, (COALESCE((o.customizations ->> 'crewBreaksUnpaid'::text), 'true'::text) <> 'false'::text))
                        END THEN (pause.mins / 60.0)
                        ELSE (0)::numeric
                    END), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS paid_hours) calc)
  WHERE (t.deleted_at IS NULL);

notify pgrst, 'reload schema';
