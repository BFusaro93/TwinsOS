-- Follow-up to 20260906180000: selecting rpt_job_visits failed with
-- "integer out of range" for any visit whose job carries a near-zero
-- budgeted_hours line (sandbox job #45's aeration line is 0.0000667 h):
-- revenue / budgeted_hours = 2.86e9 cents, past int4. Both per-man-hour
-- rate columns are bigint now; everything else is unchanged from 180000.
-- Expected sandbox: select * from rpt_job_visits for job #45's visit works,
-- revenue_cents = 190800.

drop view if exists rpt_job_visits;

create view rpt_job_visits with (security_invoker = on) as
 -- E-07: one row per crew member with the best-available fully-loaded $/hr:
 --   crm_crew_members.labor_burden_cents_per_hour when set (> 0), else the
 --   linked employee's hourly_rate_cents × (1 + org labor_burden_bps/10000).
 --   0 when neither is configured (filtered out of the averages below).
 WITH member_rates AS (
         SELECT m.org_id,
            m.crew_id,
                CASE
                    WHEN COALESCE(m.labor_burden_cents_per_hour, 0) > 0 THEN m.labor_burden_cents_per_hour::numeric
                    ELSE COALESCE(e.hourly_rate_cents, 0)::numeric * (1 + COALESCE(os.labor_burden_bps, 0)::numeric / 10000.0)
                END AS rate
           FROM crm_crew_members m
             LEFT JOIN crm_employees e ON e.id = m.employee_id AND e.deleted_at IS NULL
             LEFT JOIN crm_overhead_settings os ON os.org_id = m.org_id
        )
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    -- E-13: the date the work is reported under — completion date in Eastern
    -- time when the visit has one, else the scheduled date.
    COALESCE((v.completed_at AT TIME ZONE 'America/New_York'::text)::date, v.scheduled_date) AS worked_date,
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
    calc.rate_cents,
    calc.revenue_cents,
    labor.labor_cost_cents AS actual_labor_cost_cents,
    labor.labor_cost_source,
        CASE
            WHEN calc.actual_hours > 0::numeric THEN round(calc.revenue_cents::numeric / calc.actual_hours)::bigint
            ELSE NULL::bigint
        END AS rev_per_man_hr_cents,
        CASE
            WHEN COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours) IS NOT NULL AND calc.actual_hours IS NOT NULL
              THEN round(COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours) - calc.actual_hours, 2)
            ELSE NULL::numeric
        END AS variance_hours,
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
    round(calc.revenue_cents::numeric / NULLIF(COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours), 0::numeric))::bigint AS budgeted_rev_per_man_hr_cents,
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
     -- E-03: Σ of the job's INCLUDED service lines (rate × qty). NULL (not 0)
     -- when the job has no included lines so the COALESCE chain moves on.
     CROSS JOIN LATERAL ( SELECT sum(js.rate_cents)::integer AS rate_sum_cents,
                                 sum(js.rate_cents::numeric * COALESCE(NULLIF(js.qty, 0::numeric), 1::numeric))::integer AS revenue_sum_cents
                            FROM crm_job_services js
                           WHERE js.job_id = j.id
                             AND COALESCE(js.included, true)) svc_sum
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
            CASE
                -- per-service visit: its own explicit rate, else the linked line
                WHEN v.job_service_id IS NOT NULL THEN COALESCE(
                    (v.rate_cents::numeric * COALESCE(NULLIF(v.qty, 0::numeric), 1::numeric))::integer,
                    (s.rate_cents::numeric * COALESCE(NULLIF(s.qty, 0::numeric), 1::numeric))::integer,
                    0)
                -- whole-job visit: live Σ of the job's lines; the visit snapshot
                -- only when the job has no lines at all; then the job rate
                ELSE COALESCE(
                    svc_sum.revenue_sum_cents,
                    (v.rate_cents::numeric * COALESCE(NULLIF(v.qty, 0::numeric), 1::numeric))::integer,
                    j.rate_cents,
                    0)
            END AS revenue_cents,
            CASE
                WHEN v.job_service_id IS NOT NULL THEN COALESCE(v.rate_cents, s.rate_cents)
                ELSE COALESCE(svc_sum.rate_sum_cents, v.rate_cents, j.rate_cents)
            END AS rate_cents) calc
     -- E-07: labor cost with fallback chain. Rates are looked up for the
     -- visit's crew (visit crew, else job crew); a member's rate is their
     -- burden rate, else their employee hourly rate grossed up by the org's
     -- labor burden %.
     CROSS JOIN LATERAL ( SELECT
            CASE
                WHEN COALESCE(v.actual_labor_cost_cents, 0) > 0 THEN v.actual_labor_cost_cents
                WHEN calc.actual_hours IS NOT NULL AND COALESCE(rates.crew_rate, rates.org_rate) > 0::numeric
                    THEN round(calc.actual_hours * COALESCE(rates.crew_rate, rates.org_rate))::integer
                ELSE 0
            END AS labor_cost_cents,
            CASE
                WHEN COALESCE(v.actual_labor_cost_cents, 0) > 0 THEN 'actual'::text
                WHEN calc.actual_hours IS NOT NULL AND COALESCE(rates.crew_rate, rates.org_rate) > 0::numeric THEN 'estimated'::text
                ELSE 'none'::text
            END AS labor_cost_source
          FROM ( SELECT
                    ( SELECT avg(m.rate) FROM member_rates m WHERE m.crew_id = COALESCE(v.crew_id, j.crew_id) AND m.rate > 0::numeric) AS crew_rate,
                    ( SELECT avg(m.rate) FROM member_rates m WHERE m.org_id = v.org_id AND m.rate > 0::numeric) AS org_rate
               ) rates) labor
  WHERE v.deleted_at IS NULL;
