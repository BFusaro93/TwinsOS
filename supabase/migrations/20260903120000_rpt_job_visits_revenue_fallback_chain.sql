-- Fix rpt_job_visits.revenue_cents / rate_cents fallback chain.
--
-- Before: COALESCE(v.rate_cents, j.rate_cents, 0) * qty. Visits are inserted
-- without rate/qty and the job-creation dialog never writes crm_jobs.rate_cents
-- (only estimate conversion does, as the WHOLE-job sum), so app-created jobs
-- reported $0 per visit and estimate-converted jobs credited the entire job
-- total to every service-visit. The linked crm_job_services row was already
-- joined (alias s) but never used.
--
-- After (mirrors the app's own fallback in use-crm-jobs.ts applyJobServiceFallback):
--   visit rate×qty → linked service rate×qty → Σ job services rate×qty → job rate → 0
--
-- Column list/order is unchanged, so CREATE OR REPLACE is safe. Everything
-- else is the live PROD definition verbatim (pg_get_viewdef, 2026-09-03).
create or replace view rpt_job_visits with (security_invoker = on) as
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    v.status,
    v.sub_status,
    c.display_name AS client_name,
    COALESCE(s.service_name, ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE js.job_id = j.id)) AS service_names,
    cw.name AS crew_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    COALESCE(v.rate_cents, s.rate_cents, svc_sum.rate_sum_cents, j.rate_cents) AS rate_cents,
    calc.revenue_cents,
    v.actual_labor_cost_cents,
        CASE
            WHEN calc.actual_hours > 0::numeric THEN round(calc.revenue_cents::numeric / calc.actual_hours)::integer
            ELSE NULL::integer
        END AS rev_per_man_hr_cents,
    round(COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours, 0::numeric) - COALESCE(calc.actual_hours, 0::numeric), 2) AS variance_hours,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    v.skip_reason,
    v.clocked_in_at,
    v.clocked_out_at,
    ( SELECT string_agg(DISTINCT js.budget_method, ', '::text) AS string_agg
           FROM crm_job_services js
          WHERE js.job_id = j.id) AS budget_methods,
    COALESCE(cs.code, ( SELECT string_agg(csv.code, ', '::text ORDER BY js2.sort_order) AS string_agg
           FROM crm_job_services js2
             JOIN crm_services csv ON csv.id = js2.service_id
          WHERE js2.job_id = j.id AND csv.code IS NOT NULL)) AS service_code,
    round(calc.revenue_cents::numeric / NULLIF(COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours), 0::numeric))::integer AS budgeted_rev_per_man_hr_cents,
    v.org_id,
    COALESCE(to_char((v.clocked_in_at AT TIME ZONE 'America/New_York'::text), 'HH12:MI AM'::text), to_char(v.start_time::interval, 'HH12:MI AM'::text)) AS actual_start_time,
    COALESCE(to_char((v.clocked_out_at AT TIME ZONE 'America/New_York'::text), 'HH12:MI AM'::text), to_char(v.end_time::interval, 'HH12:MI AM'::text)) AS actual_stop_time
   FROM crm_job_visits v
     JOIN crm_jobs j ON j.id = v.job_id AND j.deleted_at IS NULL
     JOIN clients c ON c.id = COALESCE(v.client_id, j.client_id) AND c.deleted_at IS NULL
     LEFT JOIN crm_crews cw ON cw.id = COALESCE(v.crew_id, j.crew_id)
     LEFT JOIN crm_employees sr ON sr.id = j.sales_rep_id
     LEFT JOIN crm_job_services s ON s.id = v.job_service_id
     LEFT JOIN crm_services cs ON cs.id = s.service_id
     -- Σ of every service line on the job (rate × qty) — the revenue of a visit
     -- that is NOT linked to a single service line (legacy / single-visit jobs).
     CROSS JOIN LATERAL ( SELECT sum(js.rate_cents)::integer AS rate_sum_cents,
                                 sum(js.rate_cents::numeric * COALESCE(NULLIF(js.qty, 0::numeric), 1::numeric))::integer AS revenue_sum_cents
                            FROM crm_job_services js
                           WHERE js.job_id = j.id) svc_sum
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN v.clocked_in_at IS NOT NULL AND v.clocked_out_at IS NOT NULL AND v.clocked_out_at > v.clocked_in_at THEN round(EXTRACT(epoch FROM v.clocked_out_at - v.clocked_in_at) / 3600.0, 2) *
                    CASE
                        WHEN COALESCE(v.men_count, 0) = 0 THEN 1
                        ELSE v.men_count
                    END::numeric
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN v.start_time IS NOT NULL AND v.end_time IS NOT NULL AND v.end_time > v.start_time THEN round(EXTRACT(epoch FROM v.end_time - v.start_time) / 3600.0, 2) *
                    CASE
                        WHEN COALESCE(v.men_count, 0) = 0 THEN 1
                        ELSE v.men_count
                    END::numeric
                    ELSE NULL::numeric
                END) AS actual_hours,
            COALESCE(
                (v.rate_cents::numeric * COALESCE(NULLIF(v.qty, 0::numeric), 1::numeric))::integer,
                (s.rate_cents::numeric * COALESCE(NULLIF(s.qty, 0::numeric), 1::numeric))::integer,
                svc_sum.revenue_sum_cents,
                j.rate_cents,
                0) AS revenue_cents) calc
  WHERE v.deleted_at IS NULL;
