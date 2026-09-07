-- Report Center live-data verification (sandbox org, 2026-09-06) — rpt_job_visits.
--
-- E-03 (money): completed-visit revenue used the crm_job_visits.rate_cents
--   snapshot first. That column is written ONCE when the visit is generated
--   (estimate conversion / job creation) and nothing keeps it in sync when a
--   service line is re-priced — so job #45 (Castillo) reported $2,120 per visit
--   in Visits Report, Job Cost Summary, Service Profitability, Daily
--   Production, Sales Activity Detail, Job Costing page and COGS while the
--   job's service lines (and crm_jobs.rate_cents, which a rollup trigger now
--   keeps in sync — 20260906150200) sum to $1,908.
--
--   New rule (mirrors the dispatch board / client card):
--     visit linked to ONE service line (job_service_id set — per-service visit)
--         → visit rate×qty (its own explicit rate) → linked service rate×qty
--     whole-job visit (job_service_id null)
--         → Σ INCLUDED crm_job_services qty×rate   (null when the job has no lines)
--         → visit rate×qty  (only jobs with no service lines at all, e.g.
--                            API/package jobs that carry just a per-visit rate)
--         → crm_jobs.rate_cents → 0
--   i.e. the creation-time snapshot is NO LONGER READ for whole-job visits
--   whenever the job has service lines to derive from. We deliberately do not
--   add a trigger to keep crm_job_visits.rate_cents in sync: a per-visit
--   snapshot is only meaningful for per-service visits, and those are already
--   derived live here. (`included` was also ignored by the old Σ.)
--
-- E-07: actual_labor_cost_cents was the raw stored column. The crew clock-out
--   route writes member-hours × crm_crew_members.labor_burden_cents_per_hour,
--   which is 0 for every sandbox crew member, so every costing report showed
--   $0.00 labor for 6.0 man-hours with no indication anything was missing.
--   The view now applies the same fallback chain the Job Costing page uses:
--     stored actual (> 0)
--       → man_hours × visit crew's average rate, where a member's rate is
--         crm_crew_members.labor_burden_cents_per_hour, else the linked
--         crm_employees.hourly_rate_cents grossed up by the org's
--         crm_overhead_settings.labor_burden_bps
--       → man_hours × org-wide average member rate
--       → 0
--   and exposes WHICH layer produced the number in labor_cost_source
--   ('actual' | 'estimated' | 'none'). 'none' = "no labor rate configured";
--   report footnotes surface it instead of a silent $0.
--
-- E-13: Job Costing page dated Castillo's visit 9/6 (completed_at) while Job
--   Cost Summary used Sep 8 (scheduled_date). New worked_date column =
--   (completed_at at America/New_York)::date, else scheduled_date — the same
--   rule rpt_chemical_applications already applies — used by both.
--
-- Column ADDITIONS (worked_date, labor_cost_source) → CREATE OR REPLACE is not
-- allowed; DROP + CREATE. No other view depends on rpt_job_visits (checked
-- pg_depend on PROD); crm_run_report references it by name at runtime and
-- validates columns against information_schema, so nothing else changes.
-- Everything not described above is the live PROD definition verbatim
-- (pg_get_viewdef, 2026-09-06).
--
-- Expected sandbox values after applying (org a1b2c3d4-…, job #45 visit 9/8,
-- id bd7a804b-e06e-4458-b527-cf1131ad2953):
--   revenue_cents            → 190800   (was 212000)
--   rate_cents               → 48375    (legacy semantic kept: Σ line rates, not × qty;
--                                        the dataset labels it non-additive)
--   actual_labor_cost_cents  → 0, labor_cost_source → 'none' (no rates anywhere)
--   worked_date              → 2026-09-06 (completed_at 2026-09-06 04:12Z = 00:12 ET)
--   man_hours                → 6.00 (unchanged)

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
            WHEN calc.actual_hours > 0::numeric THEN round(calc.revenue_cents::numeric / calc.actual_hours)::integer
            ELSE NULL::integer
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
