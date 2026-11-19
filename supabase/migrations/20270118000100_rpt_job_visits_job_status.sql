-- rpt_job_visits: expose the parent job's status as `job_status`.
--
-- Backlog Services listed every visit still 'scheduled'/'dispatched' on or
-- before the cutoff. Cancelling a job only removes its FUTURE untouched visits
-- (findJobVisitsToRemove), so a cancelled or completed job's past-dated visits
-- keep status 'scheduled' and showed up as backlog nobody owes. The report now
-- filters on job_status; this adds the column (appended last, so
-- CREATE OR REPLACE VIEW is legal). Body is otherwise identical to
-- 20270106000300_labor_rate_aggregate_and_cost_masking.sql.

create or replace view public.rpt_job_visits with (security_invoker = on) as
 WITH crew_rates AS (
         SELECT r.org_id,
            r.crew_id,
            r.avg_rate,
            r.members
           FROM rpt_crew_labor_rates() r(org_id, crew_id, avg_rate, members)
        ), perm AS (
         SELECT crm_can_see_labor_cost() AS can_see_labor_cost
        ), visit_costs AS (
         SELECT c.visit_id,
            c.actual_labor_cost_cents
           FROM crm_job_visit_labor_costs() c(visit_id, actual_labor_cost_cents)
        )
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    COALESCE(((v.completed_at AT TIME ZONE org_timezone(v.org_id)))::date, v.scheduled_date) AS worked_date,
    v.status,
    v.sub_status,
        CASE
            WHEN (c.deleted_at IS NOT NULL) THEN (c.display_name || ' (deleted)'::text)
            ELSE c.display_name
        END AS client_name,
    COALESCE(s.service_name, ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id))) AS service_names,
    cw.name AS crew_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    (COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    calc.rate_cents,
        CASE
            WHEN v.crew_group_secondary THEN 0
            ELSE calc.revenue_cents
        END AS revenue_cents,
        CASE
            WHEN perm.can_see_labor_cost THEN labor.labor_cost_cents
            ELSE NULL::integer
        END AS actual_labor_cost_cents,
    labor.labor_cost_source,
        CASE
            WHEN (calc.actual_hours > (0)::numeric) THEN (round(((
            CASE
                WHEN v.crew_group_secondary THEN 0
                ELSE calc.revenue_cents
            END)::numeric / calc.actual_hours)))::bigint
            ELSE NULL::bigint
        END AS rev_per_man_hr_cents,
        CASE
            WHEN (((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) IS NOT NULL) AND (calc.actual_hours IS NOT NULL)) THEN round(((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) - calc.actual_hours), 2)
            ELSE NULL::numeric
        END AS variance_hours,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    v.skip_reason,
    v.clocked_in_at,
    v.clocked_out_at,
    ( SELECT string_agg(DISTINCT js.budget_method, ', '::text) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id)) AS budget_methods,
    COALESCE(cs.code, ( SELECT string_agg(csv.code, ', '::text ORDER BY js2.sort_order) AS string_agg
           FROM (crm_job_services js2
             JOIN crm_services csv ON ((csv.id = js2.service_id)))
          WHERE ((js2.job_id = j.id) AND (csv.code IS NOT NULL)))) AS service_code,
    (round(((
        CASE
            WHEN v.crew_group_secondary THEN 0
            ELSE calc.revenue_cents
        END)::numeric / NULLIF((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n), (0)::numeric))))::bigint AS budgeted_rev_per_man_hr_cents,
    v.org_id,
    COALESCE(to_char((v.clocked_in_at AT TIME ZONE org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.start_time)::interval, 'HH12:MI AM'::text)) AS actual_start_time,
    COALESCE(to_char((v.clocked_out_at AT TIME ZONE org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.end_time)::interval, 'HH12:MI AM'::text)) AS actual_stop_time,
    v.crew_group_id,
    v.crew_group_secondary,
    j.status AS job_status
   FROM ((((((((((((crm_job_visits v
     CROSS JOIN perm)
     LEFT JOIN visit_costs vc ON ((vc.visit_id = v.id)))
     JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN clients c ON ((c.id = COALESCE(v.client_id, j.client_id))))
     LEFT JOIN crm_crews cw ON ((cw.id =
        CASE
            WHEN v.crew_unassigned THEN NULL::uuid
            ELSE COALESCE(v.crew_id, j.crew_id)
        END)))
     LEFT JOIN crm_employees sr ON ((sr.id = j.sales_rep_id)))
     LEFT JOIN crm_job_services s ON ((s.id = v.job_service_id)))
     LEFT JOIN crm_services cs ON ((cs.id = s.service_id)))
     CROSS JOIN LATERAL ( SELECT (sum(js.rate_cents))::integer AS rate_sum_cents,
            (sum(((js.rate_cents)::numeric * COALESCE(NULLIF(js.qty, (0)::numeric), (1)::numeric))))::integer AS revenue_sum_cents
           FROM crm_job_services js
          WHERE ((js.job_id = j.id) AND COALESCE(js.included, true))) svc_sum)
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN ((v.clocked_in_at IS NOT NULL) AND (v.clocked_out_at IS NOT NULL) AND (v.clocked_out_at > v.clocked_in_at)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.clocked_out_at - v.clocked_in_at)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN ((v.start_time IS NOT NULL) AND (v.end_time IS NOT NULL) AND (v.end_time <> v.start_time)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM
                    CASE
                        WHEN (v.end_time > v.start_time) THEN (v.end_time - v.start_time)
                        ELSE ((v.end_time + '24:00:00'::interval) - v.start_time)
                    END) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END) AS actual_hours,
                CASE
                    WHEN (v.job_service_id IS NOT NULL) THEN COALESCE((((v.rate_cents)::numeric * COALESCE(NULLIF(v.qty, (0)::numeric), (1)::numeric)))::integer, (((s.rate_cents)::numeric * COALESCE(NULLIF(s.qty, (0)::numeric), (1)::numeric)))::integer, 0)
                    ELSE COALESCE(svc_sum.revenue_sum_cents, (((v.rate_cents)::numeric * COALESCE(NULLIF(v.qty, (0)::numeric), (1)::numeric)))::integer, j.rate_cents, 0)
                END AS revenue_cents,
                CASE
                    WHEN (v.job_service_id IS NOT NULL) THEN COALESCE(v.rate_cents, s.rate_cents)
                    ELSE COALESCE(svc_sum.rate_sum_cents, v.rate_cents, j.rate_cents)
                END AS rate_cents) calc)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (COALESCE(vc.actual_labor_cost_cents, 0) > 0) THEN vc.actual_labor_cost_cents
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN (round((calc.actual_hours * COALESCE(rates.crew_rate, rates.org_rate))))::integer
                    ELSE 0
                END AS labor_cost_cents,
                CASE
                    WHEN (COALESCE(vc.actual_labor_cost_cents, 0) > 0) THEN 'actual'::text
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN 'estimated'::text
                    ELSE 'none'::text
                END AS labor_cost_source
           FROM ( SELECT ( SELECT cr.avg_rate
                           FROM crew_rates cr
                          WHERE ((cr.crew_id =
                                CASE
                                    WHEN v.crew_unassigned THEN NULL::uuid
                                    ELSE COALESCE(v.crew_id, j.crew_id)
                                END) AND (cr.avg_rate > (0)::numeric))) AS crew_rate,
                    ( SELECT (sum((cr.avg_rate * (cr.members)::numeric)) / (NULLIF(sum(cr.members), 0))::numeric)
                           FROM crew_rates cr
                          WHERE ((cr.org_id = v.org_id) AND (cr.avg_rate > (0)::numeric))) AS org_rate) rates) labor)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (v.crew_group_id IS NULL) THEN (1)::numeric
                    ELSE GREATEST((1)::numeric, (( SELECT count(*) AS count
                       FROM crm_job_visits g
                      WHERE ((g.crew_group_id = v.crew_group_id) AND (g.deleted_at IS NULL) AND (g.status <> 'cancelled'::text))))::numeric)
                END AS n) grp)
  WHERE (v.deleted_at IS NULL);
