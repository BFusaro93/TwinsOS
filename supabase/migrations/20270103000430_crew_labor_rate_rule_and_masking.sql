-- One labor-rate rule for crew members, and the burden rate hidden from
-- anyone without "Show Wage Burden".
--
-- 1. crm_labor_rate_cents(member burden, employee hourly, org burden bps) — THE
--    rule, in one place: the crew member's own labor_burden_cents_per_hour when
--    set (> 0), else the linked employee's hourly_rate_cents × (1 + the org's
--    labor_burden_bps / 10000), rounded to whole cents; 0 when neither is set.
--    Pure (no table reads). Used by:
--      * crm_crew_member_labor_rates() below → rpt_timesheets, the Report
--        Center's Resource Time Utilization and job costing's stored labor
--        cost (src/lib/crew/visit-labor.ts, through the service client);
--      * rpt_crew_member_labor_rates() → rpt_job_visits' crew-average rate.
--    Before this, rpt_timesheets and Resource Time Utilization used ONLY the
--    member burden (a member without one costed $0) while job costing fell back
--    to hourly × org burden, so the three disagreed.
--
-- 2. crm_crew_member_labor_rates(p_member_ids uuid[] default null) — per member:
--    the raw burden field and the effective rate. SECURITY DEFINER; returns
--    rows only to the service role, or to an end user in the same org who
--    holds payroll_show_wage_burden (admins pass). Everyone else gets no rows.
--
-- 3. rpt_timesheets (security_invoker) re-stated from its LIVE definition with
--    only these changes:
--      * labor_burden_cents_per_hour = the effective rate from (2) (NULL for a
--        viewer without Show Wage Burden), and labor_cost_cents uses it (NULL
--        likewise). Column names / types unchanged.
--      * whether the stop pause is unpaid: the visit's break_paid override,
--        else the snapshot on the member's shift that payroll files the punch
--        under (crm_crew_day_shifts.breaks_unpaid via payroll_punch_work_date —
--        20270103000410/420), else the org's current setting. Same as payroll.
--
-- 4. Writing a crew member's burden rate from an end-user session needs
--    payroll_show_wage_burden too (admins pass) — the field is only shown to
--    those users; nobody should change a number they can't see.
--
-- The column-level SELECT revoke on crm_crew_members.labor_burden_cents_per_hour
-- is 20270103000440, applied AFTER the deploy.
--
-- DEPLOY: BEFORE the code deploy. Everything here works with the old code
-- (old code still reads the column directly until 440 lands).

-- ── 1. the rule ────────────────────────────────────────────────────────────
create or replace function public.crm_labor_rate_cents(
  p_member_burden_cents integer,
  p_employee_hourly_cents integer,
  p_org_burden_bps integer
)
returns integer
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when coalesce(p_member_burden_cents, 0) > 0 then p_member_burden_cents
    else round(coalesce(p_employee_hourly_cents, 0)::numeric * (1 + coalesce(p_org_burden_bps, 0)::numeric / 10000.0))::integer
  end;
$function$;

grant execute on function public.crm_labor_rate_cents(integer, integer, integer) to authenticated, service_role;

-- ── 2. gated per-member rates ──────────────────────────────────────────────
create or replace function public.crm_crew_member_labor_rates(p_member_ids uuid[] default null)
returns table(crew_member_id uuid, labor_burden_cents_per_hour integer, rate_cents integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.id,
         m.labor_burden_cents_per_hour,
         public.crm_labor_rate_cents(m.labor_burden_cents_per_hour, e.hourly_rate_cents, os.labor_burden_bps)
    from public.crm_crew_members m
    left join public.crm_employees e on e.id = m.employee_id
    left join public.crm_overhead_settings os on os.org_id = m.org_id
   where (p_member_ids is null or m.id = any (p_member_ids))
     and (
       auth.role() = 'service_role'
       or (
         (select public.my_org_id()) is not null
         and m.org_id = (select public.my_org_id())
         and (select public.has_settings_permission('payroll_show_wage_burden'))
       )
     );
$function$;

revoke all on function public.crm_crew_member_labor_rates(uuid[]) from public, anon;
grant execute on function public.crm_crew_member_labor_rates(uuid[]) to authenticated, service_role;

-- rpt_job_visits' crew-average rate: same rule (live body otherwise; the
-- employee row is no longer dropped when soft-deleted — job costing's stored
-- cost never dropped it either).
create or replace function public.rpt_crew_member_labor_rates()
 returns table(org_id uuid, crew_id uuid, rate numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select m.org_id,
         m.crew_id,
         public.crm_labor_rate_cents(m.labor_burden_cents_per_hour, e.hourly_rate_cents, os.labor_burden_bps)::numeric as rate
  from public.crm_crew_members m
  left join public.crm_employees e on e.id = m.employee_id
  left join public.crm_overhead_settings os on os.org_id = m.org_id
  where m.deleted_at is null
    and (auth.role() = 'service_role'
         or (public.my_org_id() is not null and m.org_id = public.my_org_id()));
$function$;

-- ── 3. rpt_timesheets ──────────────────────────────────────────────────────
create or replace view public.rpt_timesheets
with (security_invoker = on)
as
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
    rates.rate_cents AS labor_burden_cents_per_hour,
        CASE
            WHEN calc.paid_hours IS NOT NULL AND rates.rate_cents IS NOT NULL THEN round(calc.paid_hours * rates.rate_cents::numeric)::integer
            ELSE NULL::integer
        END AS labor_cost_cents,
    t.org_id
   FROM crm_crew_member_times t
     JOIN crm_crew_members m ON m.id = t.crew_member_id
     LEFT JOIN crm_crews cw ON cw.id = m.crew_id
     LEFT JOIN crm_job_visits v ON v.id = t.visit_id AND v.deleted_at IS NULL
     LEFT JOIN organizations o ON o.id = t.org_id
     LEFT JOIN clients c ON c.id = v.client_id
     LEFT JOIN crm_crew_member_labor_rates() rates(crew_member_id, labor_burden_cents_per_hour, rate_cents) ON rates.crew_member_id = t.crew_member_id
     LEFT JOIN LATERAL ( SELECT s.breaks_unpaid
           FROM crm_crew_day_shifts s
          WHERE t.clocked_in_at IS NOT NULL
            AND s.crew_member_id = t.crew_member_id
            AND s.deleted_at IS NULL
            AND s.work_date = payroll_punch_work_date(t.org_id, t.crew_member_id, t.clocked_in_at)
          LIMIT 1) sh ON true
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN t.clocked_out_at IS NOT NULL THEN LEAST(GREATEST(COALESCE(v.break_minutes, 0), 0)::numeric, GREATEST(EXTRACT(epoch FROM LEAST(t.clocked_out_at, COALESCE(v.clocked_out_at, t.clocked_out_at)) - GREATEST(t.clocked_in_at, COALESCE(v.clocked_in_at, t.clocked_in_at))) / 60.0, 0::numeric))
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
                            ELSE COALESCE(sh.breaks_unpaid, COALESCE(o.customizations ->> 'crewBreaksUnpaid'::text, 'true'::text) <> 'false'::text)
                        END THEN pause.mins / 60.0
                        ELSE 0::numeric
                    END, 2), 0::numeric)
                    ELSE NULL::numeric
                END AS paid_hours) calc
  WHERE t.deleted_at IS NULL;

-- ── 4. writing the burden rate ─────────────────────────────────────────────
create or replace function public.fn_crm_crew_members_guard_burden_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if not public._crm_direct_user_write() then
    return new;
  end if;
  if (tg_op = 'INSERT' and coalesce(new.labor_burden_cents_per_hour, 0) <> 0)
     or (tg_op = 'UPDATE' and new.labor_burden_cents_per_hour is distinct from old.labor_burden_cents_per_hour) then
    if not public.has_settings_permission('payroll_show_wage_burden') then
      raise exception 'Changing a crew member''s labor burden rate needs the Show Wage Burden permission'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_crm_crew_members_guard_burden_write() from public, anon, authenticated;

drop trigger if exists trg_crm_crew_members_guard_burden_write on public.crm_crew_members;
create trigger trg_crm_crew_members_guard_burden_write
  before insert or update on public.crm_crew_members
  for each row execute function public.fn_crm_crew_members_guard_burden_write();
