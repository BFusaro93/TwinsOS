-- A4: rpt_job_visits / rpt_job_services hours drifted from the canonical
-- crm_recompute_job_actual_hours (20260926200000): they ignored break_minutes
-- on the scheduled-time tier, skipped overnight (end <= start) visits and
-- rounded to 2 decimals BEFORE multiplying by men. Both views now mirror the
-- function: breaks netted off (floored at 0), end < start = next day, round
-- only on output. rpt_job_services also zeroes line_revenue_cents for
-- excluded (included = false) lines so buildServiceShares (visit-costing.ts)
-- ignores them, matching the view's own rev_weight.
--
-- rpt_job_visits base = 20260930190000, with the crew_unassigned patch from
-- 20261015000000 applied (that migration patched the live def in place, so the
-- text is restated here). Columns unchanged -> CREATE OR REPLACE.
-- rpt_job_services base = 20260906180100; columns unchanged -> CREATE OR REPLACE.

create or replace view public.rpt_job_visits with (security_invoker = on) as
 WITH member_rates AS (
         SELECT r.org_id,
            r.crew_id,
            r.rate
           FROM public.rpt_crew_member_labor_rates() r
        )
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    COALESCE(((v.completed_at AT TIME ZONE public.org_timezone(v.org_id)))::date, v.scheduled_date) AS worked_date,
    v.status,
    v.sub_status,
    c.display_name AS client_name,
    COALESCE(s.service_name, ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id))) AS service_names,
    cw.name AS crew_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    calc.rate_cents,
    calc.revenue_cents,
    labor.labor_cost_cents AS actual_labor_cost_cents,
    labor.labor_cost_source,
        CASE
            WHEN (calc.actual_hours > (0)::numeric) THEN (round(((calc.revenue_cents)::numeric / calc.actual_hours)))::bigint
            ELSE NULL::bigint
        END AS rev_per_man_hr_cents,
        CASE
            WHEN ((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) IS NOT NULL) AND (calc.actual_hours IS NOT NULL)) THEN round((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) - calc.actual_hours), 2)
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
    (round(((calc.revenue_cents)::numeric / NULLIF(COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours), (0)::numeric))))::bigint AS budgeted_rev_per_man_hr_cents,
    v.org_id,
    COALESCE(to_char((v.clocked_in_at AT TIME ZONE public.org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.start_time)::interval, 'HH12:MI AM'::text)) AS actual_start_time,
    COALESCE(to_char((v.clocked_out_at AT TIME ZONE public.org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.end_time)::interval, 'HH12:MI AM'::text)) AS actual_stop_time
   FROM (((((((((crm_job_visits v
     JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
     JOIN clients c ON (((c.id = COALESCE(v.client_id, j.client_id)) AND (c.deleted_at IS NULL))))
     LEFT JOIN crm_crews cw ON ((cw.id = (CASE WHEN v.crew_unassigned THEN NULL ELSE COALESCE(v.crew_id, j.crew_id) END))))
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
                    WHEN ((v.start_time IS NOT NULL) AND (v.end_time IS NOT NULL) AND (v.end_time <> v.start_time)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM (
                    CASE
                        WHEN (v.end_time > v.start_time) THEN (v.end_time - v.start_time)
                        ELSE ((v.end_time + '24:00:00'::interval) - v.start_time)
                    END)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
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
                    WHEN (COALESCE(v.actual_labor_cost_cents, 0) > 0) THEN v.actual_labor_cost_cents
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN (round((calc.actual_hours * COALESCE(rates.crew_rate, rates.org_rate))))::integer
                    ELSE 0
                END AS labor_cost_cents,
                CASE
                    WHEN (COALESCE(v.actual_labor_cost_cents, 0) > 0) THEN 'actual'::text
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN 'estimated'::text
                    ELSE 'none'::text
                END AS labor_cost_source
           FROM ( SELECT ( SELECT avg(m.rate) AS avg
                           FROM member_rates m
                          WHERE ((m.crew_id = (CASE WHEN v.crew_unassigned THEN NULL ELSE COALESCE(v.crew_id, j.crew_id) END)) AND (m.rate > (0)::numeric))) AS crew_rate,
                    ( SELECT avg(m.rate) AS avg
                           FROM member_rates m
                          WHERE ((m.org_id = v.org_id) AND (m.rate > (0)::numeric))) AS org_rate) rates) labor)
  WHERE (v.deleted_at IS NULL);;

create or replace view public.rpt_job_services with (security_invoker = on) as
 WITH service_weights AS (
         SELECT jsv_1.job_id,
            jsv_1.id AS job_service_id,
            COALESCE(jsv_1.budgeted_hours, 0::numeric) * COALESCE(jsv_1.team_size, 1)::numeric AS weight,
            sum(COALESCE(jsv_1.budgeted_hours, 0::numeric) * COALESCE(jsv_1.team_size, 1)::numeric) OVER (PARTITION BY jsv_1.job_id) AS total_weight,
            -- line revenue = rate × qty (qty 0/null counts as 1, matching rpt_job_visits);
            -- excluded (included = false) lines carry no weight.
            CASE
                WHEN COALESCE(jsv_1.included, true) THEN COALESCE(jsv_1.rate_cents, 0)::numeric * COALESCE(NULLIF(jsv_1.qty, 0::numeric), 1::numeric)
                ELSE 0::numeric
            END AS rev_weight,
            sum(
                CASE
                    WHEN COALESCE(jsv_1.included, true) THEN COALESCE(jsv_1.rate_cents, 0)::numeric * COALESCE(NULLIF(jsv_1.qty, 0::numeric), 1::numeric)
                    ELSE 0::numeric
                END) OVER (PARTITION BY jsv_1.job_id) AS total_rev_weight,
            count(*) OVER (PARTITION BY jsv_1.job_id) AS service_count
           FROM crm_job_services jsv_1
        )
 SELECT (v.id::text || '-'::text) || jsv.id::text AS id,
    v.id AS visit_id,
    jsv.id AS job_service_id,
    v.job_id,
    j.status AS job_status,
    j.is_complete,
    v.status AS visit_status,
    v.scheduled_date,
    c.display_name AS client_name,
    jsv.service_id,
    jsv.service_name,
    cs.category AS service_category,
    cs.unit AS service_unit,
    jsv.budget_method,
    cs.production_rate_sqft_per_hr AS assumed_production_rate,
    jsv.qty,
    jsv.budgeted_hours * COALESCE(jsv.team_size, 1)::numeric AS budgeted_hours,
    -- E-14: the line's own price and its share of the visit
    CASE WHEN COALESCE(jsv.included, true) THEN round(COALESCE(jsv.rate_cents, 0)::numeric * COALESCE(NULLIF(jsv.qty, 0::numeric), 1::numeric))::integer ELSE 0 END AS line_revenue_cents,
    round(shr.share, 4) AS revenue_share,
    round(calc.actual_hours * shr.share, 2) AS job_actual_hours,
        CASE
            WHEN COALESCE(v.men_count, j.man_count, 0) = 0 THEN 1
            ELSE COALESCE(v.men_count, j.man_count)
        END AS man_count,
    round(COALESCE(calc.actual_hours * shr.share, 0::numeric), 2) AS actual_man_hours,
        CASE
            WHEN (calc.actual_hours * shr.share) > 0::numeric THEN round(jsv.qty / (calc.actual_hours * shr.share), 2)
            ELSE NULL::numeric
        END AS actual_production_rate,
        CASE
            WHEN cs.production_rate_sqft_per_hr > 0::numeric AND (calc.actual_hours * shr.share) > 0::numeric THEN round((jsv.qty / (calc.actual_hours * shr.share) - cs.production_rate_sqft_per_hr) / cs.production_rate_sqft_per_hr * 10000::numeric)::integer
            ELSE NULL::integer
        END AS rate_variance_bps
   FROM crm_job_visits v
     JOIN crm_jobs j ON j.id = v.job_id AND j.deleted_at IS NULL
     JOIN clients c ON c.id = COALESCE(v.client_id, j.client_id) AND c.deleted_at IS NULL
     JOIN crm_job_services jsv ON v.job_service_id IS NOT NULL AND jsv.id = v.job_service_id OR v.job_service_id IS NULL AND jsv.job_id = v.job_id
     JOIN service_weights sw ON sw.job_service_id = jsv.id
     LEFT JOIN crm_services cs ON cs.id = jsv.service_id
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN v.clocked_in_at IS NOT NULL AND v.clocked_out_at IS NOT NULL AND v.clocked_out_at > v.clocked_in_at THEN GREATEST(0::numeric, EXTRACT(epoch FROM v.clocked_out_at - v.clocked_in_at) / 3600.0 - COALESCE(v.break_minutes, 0)::numeric / 60.0) *
                    CASE
                        WHEN COALESCE(v.men_count, j.man_count, 0) = 0 THEN 1
                        ELSE COALESCE(v.men_count, j.man_count)
                    END::numeric
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN v.start_time IS NOT NULL AND v.end_time IS NOT NULL AND v.end_time <> v.start_time THEN GREATEST(0::numeric, EXTRACT(epoch FROM
                    CASE
                        WHEN v.end_time > v.start_time THEN v.end_time - v.start_time
                        ELSE (v.end_time + '24:00:00'::interval) - v.start_time
                    END) / 3600.0 - COALESCE(v.break_minutes, 0)::numeric / 60.0) *
                    CASE
                        WHEN COALESCE(v.men_count, j.man_count, 0) = 0 THEN 1
                        ELSE COALESCE(v.men_count, j.man_count)
                    END::numeric
                    ELSE NULL::numeric
                END) AS actual_hours) calc
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN v.job_service_id IS NOT NULL THEN 1.0
                    WHEN sw.total_rev_weight > 0::numeric THEN sw.rev_weight / sw.total_rev_weight
                    WHEN sw.total_weight > 0::numeric THEN sw.weight / sw.total_weight
                    ELSE 1.0 / sw.service_count::numeric
                END AS share) shr
  WHERE v.deleted_at IS NULL;

notify pgrst, 'reload schema';
