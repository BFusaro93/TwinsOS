-- Deduct crm_job_visits.break_minutes from every "actual hours" computation.
--
-- The crew Pause/Break button (migration 20260906200000) records break_minutes
-- and the stop clock-out route nets it off the duration it writes into
-- crm_job_visits.actual_hours. Nothing else ever looked at the column:
--
--   * crm_recompute_job_actual_hours() -- the crm_jobs.actual_hours rollup
--   * rpt_job_visits.actual_hours / man_hours -- and therefore
--     rev_per_man_hr_cents, hours_variance and actual_labor_cost_cents,
--     i.e. every hours and job-costing number in the Report Center
--   * computeActualHours() in src/lib/utils/visit-hours.ts -- the board and
--     job-detail display fallback (fixed in the same commit as this migration)
--
-- All three only fire when actual_hours is NULL, so they are the path taken by
-- the PER-VISIT crew clock-out route, which deliberately does not write
-- actual_hours. On that path a one-hour lunch inside a nine-hour day was
-- costed and reported as nine worked hours per crew member.
--
-- The break is netted off the raw duration BEFORE the men multiplier, and
-- floored at zero so a break longer than the recorded shift yields 0 rather
-- than negative hours. An explicit actual_hours override is still taken as-is
-- -- it is already net of break and already man-multiplied.
--
-- The scheduled start/end tier subtracts the break too. In practice
-- break_minutes is only ever set by a crew that also clocked in, so that tier
-- sees 0; subtracting keeps the three implementations literally identical
-- rather than subtly divergent.

create or replace function public.crm_recompute_job_actual_hours(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update crm_jobs
  set actual_hours = (
    select coalesce(sum(
      coalesce(
        v.actual_hours,
        case
          when v.clocked_in_at is not null and v.clocked_out_at is not null
           and v.clocked_out_at > v.clocked_in_at
          then greatest(0, extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0
                           - coalesce(v.break_minutes, 0) / 60.0)
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end,
        case
          when v.start_time is not null and v.end_time is not null
           and v.end_time > v.start_time
          then greatest(0, extract(epoch from (v.end_time - v.start_time)) / 3600.0
                           - coalesce(v.break_minutes, 0) / 60.0)
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end
      )
    ), 0)
    from crm_job_visits v
    where v.job_id = p_job_id
      and v.deleted_at is null
  )
  where id = p_job_id;
end;
$function$;

-- rpt_job_visits: identical body to 20260906180500, with break_minutes netted
-- off both derived tiers of the `calc` lateral.
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
                    WHEN v.clocked_in_at IS NOT NULL AND v.clocked_out_at IS NOT NULL AND v.clocked_out_at > v.clocked_in_at THEN round(GREATEST(0, EXTRACT(epoch FROM v.clocked_out_at - v.clocked_in_at) / 3600.0 - COALESCE(v.break_minutes, 0) / 60.0), 2) *
                    CASE
                        WHEN COALESCE(v.men_count, 0) = 0 THEN 1
                        ELSE v.men_count
                    END::numeric
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN v.start_time IS NOT NULL AND v.end_time IS NOT NULL AND v.end_time > v.start_time THEN round(GREATEST(0, EXTRACT(epoch FROM v.end_time - v.start_time) / 3600.0 - COALESCE(v.break_minutes, 0) / 60.0), 2) *
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
