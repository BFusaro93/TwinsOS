-- E-14: COGS by Service attributed 100% of Castillo's (#45) $2,120 and 6.0 hrs
-- to the $0 "Test Aeration Service" line; Mulch / edging / clean-up got $0 / 0.0.
--
-- Root cause: for a whole-job visit (job_service_id null) rpt_job_services
-- split the visit's hours across the job's lines by BUDGETED HOURS. On #45 the
-- three manual-rate lines have budgeted_hours = 0 and the production-rate
-- aeration line has 0.0000667, so aeration owned the whole weight. The TS side
-- (src/lib/visit-costing.ts buildServiceShares) then weighted revenue by
-- actual_man_hours — the same lopsided share — so $ followed the hours.
--
-- New share rule (revenue first, per the spec):
--   per-service visit (job_service_id set) → 1.0 for its line
--   Σ line revenue > 0                       → line qty×rate ÷ Σ job's included lines
--   Σ budgeted man-hours > 0                 → budgeted man-hours share (old rule)
--   else                                     → even split
-- Exposed as new columns line_revenue_cents (qty × rate of the line) and
-- revenue_share (the fraction above) so visit-costing.ts can weight $ by the
-- lines' own prices and hours by revenue share, and so the Report Center can
-- show a line's price next to its hours.
--
-- Column additions → DROP + CREATE (no dependent views; crm_run_report
-- validates columns against information_schema at runtime). Everything else is
-- the live PROD definition verbatim (pg_get_viewdef, 2026-09-06).
--
-- Expected sandbox values for visit bd7a804b-e06e-4458-b527-cf1131ad2953 (#45):
--   Mulch             line_revenue_cents 85050  revenue_share 0.4458  actual_man_hours 2.67
--   Mulch bed edging  line_revenue_cents 69750  revenue_share 0.3656  actual_man_hours 2.19
--   Spring Clean-up   line_revenue_cents 36000  revenue_share 0.1887  actual_man_hours 1.13
--   Test Aeration     line_revenue_cents     0  revenue_share 0.0000  actual_man_hours 0.00

drop view if exists rpt_job_services;

create view rpt_job_services with (security_invoker = on) as
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
    round(COALESCE(jsv.rate_cents, 0)::numeric * COALESCE(NULLIF(jsv.qty, 0::numeric), 1::numeric))::integer AS line_revenue_cents,
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
                    WHEN v.clocked_in_at IS NOT NULL AND v.clocked_out_at IS NOT NULL AND v.clocked_out_at > v.clocked_in_at THEN round(EXTRACT(epoch FROM v.clocked_out_at - v.clocked_in_at) / 3600.0, 2) *
                    CASE
                        WHEN COALESCE(v.men_count, j.man_count, 0) = 0 THEN 1
                        ELSE COALESCE(v.men_count, j.man_count)
                    END::numeric
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN v.start_time IS NOT NULL AND v.end_time IS NOT NULL AND v.end_time > v.start_time THEN round(EXTRACT(epoch FROM v.end_time - v.start_time) / 3600.0, 2) *
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
