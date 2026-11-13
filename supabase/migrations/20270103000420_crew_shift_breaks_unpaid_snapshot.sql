-- "Crew pauses are unpaid" is snapshotted onto each day shift when the day ends.
--
-- Owner decision (bug sweep round 13): the org setting
-- organizations.customizations.crewBreaksUnpaid used to be read live by
-- payroll, the Timesheet report and job costing, so flipping it re-priced
-- every past day — including days already paid and locked. Now:
--
--   crm_crew_day_shifts.breaks_unpaid (boolean, null = not snapshotted yet) is
--   set from the org setting the moment the shift gets an ended_at (End Day,
--   member out, marked absent, an office correction — every path, because it
--   is a trigger). Reopening the day keeps the snapshot; a second End Day
--   doesn't re-take it. A later change to the setting therefore only affects
--   days that end after it.
--
--   It is server-managed: an end-user session (_crm_direct_user_write()) can't
--   set or change it — the trigger keeps the old value.
--
--   Readers resolve a stop pause as: the visit's own break_paid override, else
--   the snapshot on the member's shift that covers the punch, else (no shift,
--   or still open) the org's current setting.
--
-- Backfill: every already-ENDED shift gets today's setting — what payroll
-- computes for it right now — so the first change to the setting after this
-- ships does not re-price history (locked days included; the payroll lock
-- bypass is used for this maintenance write, and the audit / updated_at
-- triggers are paused so history isn't rewritten as "edited today").
--
-- DEPLOY: BEFORE the code deploy (the new code selects breaks_unpaid; old code
-- ignores the column).

alter table public.crm_crew_day_shifts
  add column if not exists breaks_unpaid boolean;

comment on column public.crm_crew_day_shifts.breaks_unpaid is
  'Snapshot of the org''s "crew pauses are unpaid" setting taken when this day ended (null = still open / never ended). Payroll uses it so a later setting change does not re-price past days. Server-managed.';

-- The org setting, readable by trigger and report code regardless of the
-- caller's access to organizations.
create or replace function public.crew_breaks_unpaid(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select (o.customizations ->> 'crewBreaksUnpaid') is distinct from 'false'
       from public.organizations o
      where o.id = p_org_id),
    true
  );
$function$;

revoke all on function public.crew_breaks_unpaid(uuid) from public, anon;
grant execute on function public.crew_breaks_unpaid(uuid) to authenticated, service_role;

create or replace function public.fn_crm_crew_day_shifts_breaks_snapshot()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if public._crm_direct_user_write() then
    if tg_op = 'INSERT' then
      new.breaks_unpaid := null;
    else
      new.breaks_unpaid := old.breaks_unpaid;
    end if;
  end if;
  if new.ended_at is not null and new.breaks_unpaid is null then
    new.breaks_unpaid := public.crew_breaks_unpaid(new.org_id);
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_crm_crew_day_shifts_breaks_snapshot() from public, anon, authenticated;

-- "trg_crm_crew_day_shifts_b…" sorts before "…_payroll_lock", so the lock
-- guard judges the row with its snapshot in place.
drop trigger if exists trg_crm_crew_day_shifts_breaks_snapshot on public.crm_crew_day_shifts;
create trigger trg_crm_crew_day_shifts_breaks_snapshot
  before insert or update on public.crm_crew_day_shifts
  for each row execute function public.fn_crm_crew_day_shifts_breaks_snapshot();

-- ── backfill ended shifts with the current setting ─────────────────────────
alter table public.crm_crew_day_shifts disable trigger trg_crm_crew_day_shifts_audit;
alter table public.crm_crew_day_shifts disable trigger set_crm_crew_day_shifts_updated_at;
do $$
begin
  perform set_config('app.payroll_lock_bypass', 'on', true);
  update public.crm_crew_day_shifts s
     set breaks_unpaid = public.crew_breaks_unpaid(s.org_id)
   where s.ended_at is not null
     and s.breaks_unpaid is null;
  perform set_config('app.payroll_lock_bypass', '', true);
end $$;
alter table public.crm_crew_day_shifts enable trigger set_crm_crew_day_shifts_updated_at;
alter table public.crm_crew_day_shifts enable trigger trg_crm_crew_day_shifts_audit;
