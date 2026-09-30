-- ============================================================
-- crm_employees: lock down writes and sensitive columns.
--
-- Before this, SELECT and UPDATE on crm_employees were just
-- `org_id = my_org_id()` (the original 20260706123923 policies, verified on
-- PROD). Any org member — crew logins included — could read birth dates,
-- driver licenses, I-9 numbers, spouse info, pay rates and clock PINs, and
-- could rewrite pay/commission or un-soft-delete their own row (which
-- re-grants whatever crm_role_id the row last had).
--
-- 1. UPDATE: admins, or holders of emp_edit / emp_manage (the crm_roles keys
--    the Employees screen gates Edit / Activate / Deactivate on).
--    INSERT: additionally requires emp_add / emp_edit / emp_manage.
-- 2. prevent_crm_role_id_escalation(): re-stated with BOTH the crm_role_id
--    and user_id checks (20260824141000 — the 20260829040000 catch-up had
--    silently dropped the user_id check; PROD is only correct because the two
--    were applied out of order) plus a new rule: changing deleted_at
--    (soft-delete / un-delete) is admin-only.
-- 3. Full rows come from the SECURITY DEFINER RPC crm_list_employees(),
--    which masks per caller permission (the new client reads employees
--    through it; 20260930190200 then removes direct SELECT on the sensitive
--    columns below):
--      identity  (emp_view_info / emp_edit / emp_manage / admin):
--        birth_date, citizenship, marital_status, num_dependants,
--        spouse_name, spouse_phone, i9_number, i9_expiration_date,
--        reason_for_release
--      license   (emp_view_license_info / emp_edit / emp_manage / admin):
--        driver_license, license_expiration
--      pay       (payroll_show_pay_rate / payroll_show_wage_burden /
--                 emp_edit / emp_manage / admin):
--        hourly_rate_cents, overtime_rate_cents, commission_pct,
--        last_pay_raise_cents, last_pay_raise_date, labor_burden_cents_per_hour
--      clock PIN (emp_edit / emp_manage / admin): resource_pin
--    Editors always get the real values, so saving the edit dialog can never
--    write a masked NULL back over real data.
-- 4. The two security_invoker report views that read a sensitive column are
--    re-stated from their latest definitions with only that read changed, so
--    they keep working once 20260930190200 lands:
--      rpt_job_visits: member rates now come from a SECURITY DEFINER helper
--        (same org-scoped data the CTE read before; labor cost unchanged).
--      rpt_employees.hourly_rate_cents: via crm_employee_hourly_rate_cents(),
--        NULL unless the caller may see pay.
--
-- DEPLOY ORDER. Everything in THIS file is additive / compatible with both
-- the deployed (origin/main) client and the new client, so it is applied
-- BEFORE the deploy:
--   * table SELECT is untouched here, so the deployed client's select("*")
--     and sensitive-column embeds keep working;
--   * the write policies only require the permissions the Employees screen
--     already gates the same buttons on (Add: emp_add, Edit: emp_edit,
--     Activate/Deactivate: emp_manage; admins pass has_settings_permission),
--     and use-employees.ts is the only client writer of crm_employees;
--   * the trigger only fires on a CHANGED crm_role_id / user_id / deleted_at
--     (the edit form re-sends unchanged values), and no client path
--     soft-deletes employees;
--   * the views/helpers are definer-backed, so they work with or without the
--     column grants.
-- The table-level SELECT revoke + per-column grants are in
-- 20260930190200_crm_employees_revoke_sensitive_columns.sql, applied AFTER
-- the deploy (the deployed client would break under it).
-- ============================================================

-- ── 1. write policies ──────────────────────────────────────────────────────
drop policy if exists "org members can update employees" on public.crm_employees;
create policy "org members can update employees" on public.crm_employees
  for update
  using (
    org_id = public.my_org_id()
    and (public.has_settings_permission('emp_edit') or public.has_settings_permission('emp_manage'))
  )
  with check (
    org_id = public.my_org_id()
    and (public.has_settings_permission('emp_edit') or public.has_settings_permission('emp_manage'))
  );

-- Re-states 20260829040000's insert policy (crm_role_id admin-only) and adds
-- the employee-permission requirement.
drop policy if exists "org members can insert employees" on public.crm_employees;
create policy "org members can insert employees" on public.crm_employees
  for insert
  with check (
    org_id = public.my_org_id()
    and (
      public.has_settings_permission('emp_add')
      or public.has_settings_permission('emp_edit')
      or public.has_settings_permission('emp_manage')
    )
    and (
      crm_role_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  );

-- ── 2. escalation trigger (role, linked user, soft-delete) ─────────────────
create or replace function public.prevent_crm_role_id_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
begin
  if (new.crm_role_id is distinct from old.crm_role_id)
     or (new.user_id is distinct from old.user_id)
     or (new.deleted_at is distinct from old.deleted_at) then
    if v_caller_id is null then
      -- Service-role session — the calling API route already verified
      -- the caller's admin status before using the admin client.
      return new;
    end if;

    select role into v_caller_role from public.profiles where id = v_caller_id;

    if v_caller_role is distinct from 'admin' then
      raise exception 'Only an admin may change an employee''s assigned role, linked user, or deleted status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_crm_role_id_escalation on public.crm_employees;
create trigger trg_prevent_crm_role_id_escalation
  before update on public.crm_employees
  for each row execute function public.prevent_crm_role_id_escalation();

-- ── 3. masked full-row RPC ────────────────────────────────────────────────
-- (The column REVOKE/GRANT itself lives in 20260930190200, applied AFTER the
-- deploy — see the header.)
-- Full (per-permission masked) employee rows for the Employees screen and
-- every other caller that used to `select *`. Returns setof crm_employees so
-- PostgREST can still embed relations (manager:manager_id(...)) and filter.
create or replace function public.crm_list_employees(
  p_employee_id uuid default null
)
returns setof public.crm_employees
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org      uuid := public.my_org_id();
  v_edit     boolean;
  v_identity boolean;
  v_license  boolean;
  v_pay      boolean;
  r          public.crm_employees%rowtype;
begin
  if v_org is null then
    return;
  end if;

  v_edit     := public.has_settings_permission('emp_edit') or public.has_settings_permission('emp_manage');
  v_identity := v_edit or public.has_settings_permission('emp_view_info');
  v_license  := v_edit or public.has_settings_permission('emp_view_license_info');
  v_pay      := v_edit or public.has_settings_permission('payroll_show_pay_rate')
                       or public.has_settings_permission('payroll_show_wage_burden');

  for r in
    select * from public.crm_employees e
    where e.org_id = v_org
      and e.deleted_at is null
      and (p_employee_id is null or e.id = p_employee_id)
  loop
    if not v_identity then
      r.birth_date := null; r.citizenship := null; r.marital_status := null;
      r.num_dependants := null; r.spouse_name := null; r.spouse_phone := null;
      r.i9_number := null; r.i9_expiration_date := null; r.reason_for_release := null;
    end if;
    if not v_license then
      r.driver_license := null; r.license_expiration := null;
    end if;
    if not v_pay then
      r.hourly_rate_cents := null; r.overtime_rate_cents := null; r.commission_pct := null;
      r.last_pay_raise_cents := null; r.last_pay_raise_date := null;
      r.labor_burden_cents_per_hour := null;
    end if;
    if not v_edit then
      r.resource_pin := null;
    end if;
    return next r;
  end loop;
end;
$$;
revoke all on function public.crm_list_employees(uuid) from public, anon;
grant execute on function public.crm_list_employees(uuid) to authenticated, service_role;

-- ── 4. report views ────────────────────────────────────────────────────────
create or replace function public.crm_employee_hourly_rate_cents(p_employee_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select e.hourly_rate_cents
  from public.crm_employees e
  where e.id = p_employee_id
    and (
      auth.role() = 'service_role'
      or (
        public.my_org_id() is not null
        and e.org_id = public.my_org_id()
        and (
          public.has_settings_permission('payroll_show_pay_rate')
          or public.has_settings_permission('emp_edit')
          or public.has_settings_permission('emp_manage')
        )
      )
    );
$$;
revoke all on function public.crm_employee_hourly_rate_cents(uuid) from public, anon;
grant execute on function public.crm_employee_hourly_rate_cents(uuid) to authenticated, service_role;

-- Exactly the rows rpt_job_visits' member_rates CTE computed before (the
-- caller's org via RLS), now read with definer rights so the view no longer
-- needs SELECT on crm_employees.hourly_rate_cents. Only per-crew rates leave
-- this function, the same figures the view's labor cost already implies.
create or replace function public.rpt_crew_member_labor_rates()
returns table (org_id uuid, crew_id uuid, rate numeric)
language sql
stable
security definer
set search_path = public
as $$
  select m.org_id,
         m.crew_id,
         case
           when coalesce(m.labor_burden_cents_per_hour, 0) > 0 then m.labor_burden_cents_per_hour::numeric
           else coalesce(e.hourly_rate_cents, 0)::numeric * (1 + coalesce(os.labor_burden_bps, 0)::numeric / 10000.0)
         end as rate
  from public.crm_crew_members m
  left join public.crm_employees e on e.id = m.employee_id and e.deleted_at is null
  left join public.crm_overhead_settings os on os.org_id = m.org_id
  where auth.role() = 'service_role'
     or (public.my_org_id() is not null and m.org_id = public.my_org_id());
$$;
revoke all on function public.rpt_crew_member_labor_rates() from public, anon;
grant execute on function public.rpt_crew_member_labor_rates() to authenticated, service_role;

-- rpt_employees (latest: 20260706233504), hourly_rate_cents via the helper.
create or replace view rpt_employees
with (security_invoker = on) as
select
  e.id,
  trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as full_name,
  e.first_name,
  e.last_name,
  e.email,
  e.phone,
  e.cell_phone,
  e.city,
  e.state,
  e.employment_status,
  e.compensation_type,
  public.crm_employee_hourly_rate_cents(e.id) as hourly_rate_cents,
  e.user_type,
  e.resource_code,
  e.applicator_license,
  e.is_sales_rep,
  e.is_active,
  e.date_hired,
  e.emergency_contact,
  e.emergency_phone
from crm_employees e
where e.deleted_at is null;

-- rpt_job_visits (latest: 20260927130400), only the member_rates CTE changed.
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
     LEFT JOIN crm_crews cw ON ((cw.id = COALESCE(v.crew_id, j.crew_id))))
     LEFT JOIN crm_employees sr ON ((sr.id = j.sales_rep_id)))
     LEFT JOIN crm_job_services s ON ((s.id = v.job_service_id)))
     LEFT JOIN crm_services cs ON ((cs.id = s.service_id)))
     CROSS JOIN LATERAL ( SELECT (sum(js.rate_cents))::integer AS rate_sum_cents,
            (sum(((js.rate_cents)::numeric * COALESCE(NULLIF(js.qty, (0)::numeric), (1)::numeric))))::integer AS revenue_sum_cents
           FROM crm_job_services js
          WHERE ((js.job_id = j.id) AND COALESCE(js.included, true))) svc_sum)
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN ((v.clocked_in_at IS NOT NULL) AND (v.clocked_out_at IS NOT NULL) AND (v.clocked_out_at > v.clocked_in_at)) THEN (round(GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.clocked_out_at - v.clocked_in_at)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))), 2) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN ((v.start_time IS NOT NULL) AND (v.end_time IS NOT NULL) AND (v.end_time > v.start_time)) THEN (round(GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.end_time - v.start_time)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))), 2) * (
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
                          WHERE ((m.crew_id = COALESCE(v.crew_id, j.crew_id)) AND (m.rate > (0)::numeric))) AS crew_rate,
                    ( SELECT avg(m.rate) AS avg
                           FROM member_rates m
                          WHERE ((m.org_id = v.org_id) AND (m.rate > (0)::numeric))) AS org_rate) rates) labor)
  WHERE (v.deleted_at IS NULL);

notify pgrst, 'reload schema';
