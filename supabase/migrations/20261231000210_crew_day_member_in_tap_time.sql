-- crew_day_member_in: a crew login's "member in" records the TAP time, bounded.
--
-- The crew app queues Start Day / End Day / member in-out while it has no
-- signal and replays them on reconnect. The route used to stamp its own clock,
-- and this function forced now() for crew logins, so a member tapped in at
-- 7:00 with no signal was paid from whenever the phone reconnected.
--
-- The route now sends the tap time (bounded there by resolveOccurredAt). This
-- function keeps the guarantee that a crew login can't write an arbitrary
-- time: for role 'crew', p_at is honoured only within the same window the app
-- routes use (no more than 48 hours back, no more than 2 minutes ahead, never
-- after now()); anything outside it, or NULL, becomes now() as before.
--
-- Body is the live definition (20261223000301); only the crew time rule
-- changed. Every guard (org, CRM access, read-only org, dispatch-board
-- permission or own crew) is kept, and the grants are re-stated.

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
  -- A crew login records the moment of the tap (an offline tap replays later),
  -- but only inside the bounded window; otherwise the server's time.
  if coalesce(public.my_role(), '') = 'crew' then
    if p_at is null
       or p_at < now() - interval '48 hours'
       or p_at > now() + interval '2 minutes' then
      p_at := now();
    else
      p_at := least(p_at, now());
    end if;
  end if;
  p_at := coalesce(p_at, now());

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
