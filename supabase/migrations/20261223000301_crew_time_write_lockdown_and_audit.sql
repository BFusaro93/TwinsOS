-- Payroll integrity: crew logins can no longer write shift / punch times directly.
--
-- crm_crew_day_shifts' crew_day_insert / crew_day_update policies let a crew
-- login INSERT/UPDATE any column of its own members' shifts, and
-- crm_crew_member_times has a broad org-wide ALL policy. Through PostgREST a
-- crew login could therefore set started_at / ended_at / break_minutes or punch
-- times to anything, bypassing the API's validation (punch length, no future
-- times) and the "invoice already sent" lock on punch edits.
--
-- Every crew flow that writes these tables (Start/End Day, member in/out,
-- attendance, Start/Stop Job, skip, the crew's punch editor) now writes with the
-- service client AFTER the route's own authorization, so the crew role can be
-- refused direct writes outright (RESTRICTIVE policies below). Office users are
-- unchanged (their writes still go through RLS with their own permissions).
--
-- crew_day_member_in (the Start Day "member in" RPC) wrote the shift under the
-- caller's RLS, so it becomes SECURITY DEFINER and states the checks RLS used to
-- make (org, CRM access, read-only org, sched_dispatch_board or own crew). For a
-- crew caller the time is the server's now() -- the route always passed its own
-- server time, so the crew can't backdate a shift through the RPC either.
--
-- Also: fn_audit_log triggers on crm_crew_day_shifts and crm_payroll_adjustments
-- (payroll's two editable inputs had no history), with readable record types.

-- ── 1. No direct crew writes ────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['crm_crew_day_shifts', 'crm_crew_member_times'] loop
    execute format('drop policy if exists crew_role_no_direct_write_ins on public.%I', t);
    execute format('drop policy if exists crew_role_no_direct_write_upd on public.%I', t);
    execute format('drop policy if exists crew_role_no_direct_write_del on public.%I', t);
    execute format($p$create policy crew_role_no_direct_write_ins on public.%I as restrictive for insert
      with check (coalesce(public.my_role(), '') <> 'crew')$p$, t);
    execute format($p$create policy crew_role_no_direct_write_upd on public.%I as restrictive for update
      using (coalesce(public.my_role(), '') <> 'crew')
      with check (coalesce(public.my_role(), '') <> 'crew')$p$, t);
    execute format($p$create policy crew_role_no_direct_write_del on public.%I as restrictive for delete
      using (coalesce(public.my_role(), '') <> 'crew')$p$, t);
  end loop;
end $$;

-- ── 2. crew_day_member_in: SECURITY DEFINER with explicit checks ────────────
-- Body is the live definition; only the guard block and SECURITY DEFINER are new.
create or replace function public.crew_day_member_in(p_member uuid, p_work_date date, p_at timestamp with time zone)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_shift record;
  v_away integer;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_crew_members where id = p_member and org_id = v_org) then
    raise exception 'crew member not found' using errcode = '42501';
  end if;

  -- What the crm_crew_day_shifts / crm_crew_day_absences RLS checked before
  -- this function bypassed it.
  if not public.has_crm_access() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select public.my_org_is_read_only()) is true then
    raise exception 'organization is read-only' using errcode = '42501';
  end if;
  if not (
    public.has_settings_permission('sched_dispatch_board')
    or public.crew_day_member_is_mine(p_member, p_work_date)
    -- a shift reopened from yesterday (storm work past midnight) for someone on the crew today
    or public.crew_day_member_is_mine(p_member, p_work_date + 1)
  ) then
    raise exception 'that crew member is not on your crew' using errcode = '42501';
  end if;
  -- A crew login stamps the server's time, never one it chose.
  if coalesce(public.my_role(), '') = 'crew' then
    p_at := now();
  end if;

  select id, ended_at, break_minutes into v_shift
  from public.crm_crew_day_shifts
  where crew_member_id = p_member and work_date = p_work_date and deleted_at is null and org_id = v_org
  for update;

  if found then
    -- Left, then came back: reopen and take the time away off the clock.
    v_away := case when v_shift.ended_at is null then 0
                   else greatest(0, round(extract(epoch from (p_at - v_shift.ended_at)) / 60)::integer) end;
    update public.crm_crew_day_shifts
      set ended_at = null, break_minutes = coalesce(v_shift.break_minutes, 0) + v_away
      where id = v_shift.id;
  else
    insert into public.crm_crew_day_shifts (org_id, crew_member_id, work_date, started_at, source, created_by)
    values (v_org, p_member, p_work_date, p_at, 'crew', auth.uid());
  end if;

  update public.crm_crew_day_absences set deleted_at = p_at
    where crew_member_id = p_member and work_date = p_work_date and deleted_at is null and org_id = v_org;
end;
$function$;

revoke all on function public.crew_day_member_in(uuid, date, timestamptz) from public, anon;
grant execute on function public.crew_day_member_in(uuid, date, timestamptz) to authenticated, service_role;

-- ── 3. Audit history for shifts and payroll adjustments ─────────────────────
drop trigger if exists trg_crm_crew_day_shifts_audit on public.crm_crew_day_shifts;
create trigger trg_crm_crew_day_shifts_audit
  after insert or update or delete on public.crm_crew_day_shifts
  for each row execute function public.fn_audit_log();

drop trigger if exists trg_crm_payroll_adjustments_audit on public.crm_payroll_adjustments;
create trigger trg_crm_payroll_adjustments_audit
  after insert or update or delete on public.crm_payroll_adjustments
  for each row execute function public.fn_audit_log();

-- Give the two tables readable record types and titles ("Crew Day Shift
-- updated — Jose — 2026-12-23 ..."), patched INTO the live fn_audit_log so
-- none of its other branches/guards are restated (and so can't be dropped).
do $$
declare
  v_src text := pg_get_functiondef('public.fn_audit_log()'::regprocedure);
  v_title_expr constant text :=
    'coalesce((select cm.name from crm_crew_members cm where cm.id = coalesce((r_new ->> ''crew_member_id'')::uuid, (r_old ->> ''crew_member_id'')::uuid)), ''crew member'')'
    || ' || '' — '' || coalesce(r_new ->> ''work_date'', r_old ->> ''work_date'', '''')';
  v_needle text;
  v_patches text[][] := array[
    array[
      E'    when ''crm_schedules''         then ''schedule''\n    else TG_TABLE_NAME\n',
      E'    when ''crm_schedules''         then ''schedule''\n'
      || E'    when ''crm_crew_day_shifts''   then ''crew_day_shift''\n'
      || E'    when ''crm_payroll_adjustments'' then ''payroll_adjustment''\n'
      || E'    else TG_TABLE_NAME\n'
    ],
    array[
      E'    else coalesce(r_new ->> ''name'', r_old ->> ''name'', r_new ->> ''title'', r_old ->> ''title'',',
      E'    when ''crm_crew_day_shifts'' then ' || v_title_expr || E'\n'
      || E'    when ''crm_payroll_adjustments'' then ' || v_title_expr || E'\n'
      || E'    else coalesce(r_new ->> ''name'', r_old ->> ''name'', r_new ->> ''title'', r_old ->> ''title'','
    ],
    array[
      E'''crew'',''document_template'',''email_template'',''schedule'')',
      E'''crew'',''document_template'',''email_template'',''schedule'',\n                                   ''crew_day_shift'',''payroll_adjustment'')'
    ]
  ];
  i int;
begin
  if position('crew_day_shift' in v_src) > 0 then
    return; -- already patched
  end if;
  for i in 1 .. array_length(v_patches, 1) loop
    v_needle := v_patches[i][1];
    if (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle) <> 1 then
      raise exception 'fn_audit_log patch % did not match exactly once', i;
    end if;
    v_src := replace(v_src, v_needle, v_patches[i][2]);
  end loop;
  execute v_src;
end $$;
