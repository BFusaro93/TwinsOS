-- Round 14 (access F2): platform staff = an explicit allowlist, and
-- impersonation sessions are capped and append-only.
--
-- Before: is_staff() was "any active profile in an is_platform_staff_org org",
-- regardless of role, and staff_impersonation_sessions had one FOR ALL policy
-- with no limits — a staff-org viewer could open a session into any tenant
-- that never expired, then rewrite or delete the record.
--
-- 1. platform_staff_allowlist(user_id): the only way to be staff. Deny-all
--    table (RLS on, no policies, no grants to end users) — rows are managed
--    by the platform owner with the service role / SQL editor only.
--    is_staff() requires the allowlist row AND an active profile in the
--    staff org (both must hold).
-- 2. staff_impersonation_sessions:
--    - INSERT: staff_user_id is the caller, started_at is now(), expires_at is
--      clamped to at most started_at + 4 hours (default stays 1 hour).
--    - UPDATE: only ended_at may change, only from NULL to a time (once).
--    - DELETE / TRUNCATE: revoked from end users, no policy.
--
-- PROD: apply together with the allowlist seed below, in the same sitting —
-- until a staff member is on the allowlist, is_staff() is false for them
-- (no impersonation, no support-chat staff view). Order vs. code deploy does
-- not matter (no app change depends on it).
--
-- PROD seed — first LIST the candidates and confirm with the owner:
--   select p.id, p.email, p.name, p.role, p.status
--     from profiles p join organizations o on o.id = p.org_id
--    where o.is_platform_staff_org and p.status is distinct from 'inactive'
--    order by p.role, p.email;
-- then insert the confirmed ones (example: all active staff-org admins):
--   insert into public.platform_staff_allowlist(user_id, note)
--   select p.id, 'seeded at round 14 rollout'
--     from profiles p join organizations o on o.id = p.org_id
--    where o.is_platform_staff_org and p.role = 'admin'
--      and p.status is distinct from 'inactive'
--   on conflict (user_id) do nothing;
-- Existing open sessions longer than 4h (pre-check, informational):
--   select id, staff_user_id, target_org_id, started_at, expires_at
--     from staff_impersonation_sessions
--    where ended_at is null and expires_at > started_at + interval '4 hours';

create table if not exists public.platform_staff_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);

alter table public.platform_staff_allowlist enable row level security;
revoke all on table public.platform_staff_allowlist from anon, authenticated;
comment on table public.platform_staff_allowlist is
  'Platform staff allowlist (is_staff()). Deny-all to end users by design: no RLS policies. Manage with the service role only.';

create or replace function public.is_staff(uid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.platform_staff_allowlist a
    join public.profiles p on p.id = a.user_id
    join public.organizations o on o.id = p.org_id
    where a.user_id = uid
      and p.status is distinct from 'inactive'
      and o.is_platform_staff_org = true
  );
$function$;

-- ── Session guard ───────────────────────────────────────────────────────────
create or replace function public.guard_staff_impersonation_session()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- In-database maintenance (no JWT at all) is not restricted.
  if auth.uid() is null and auth.role() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.staff_user_id := auth.uid();
    end if;
    if new.target_org_id is null then
      raise exception 'An impersonation session needs a target organization' using errcode = '23502';
    end if;
    new.started_at := now();
    new.ended_at := null;
    new.expires_at := least(coalesce(new.expires_at, now() + interval '1 hour'),
                            new.started_at + interval '4 hours');
    if new.expires_at <= new.started_at then
      raise exception 'expires_at must be after started_at' using errcode = '22023';
    end if;
    return new;
  end if;

  -- UPDATE: the record is append-only except for ending the session once.
  if new.id is distinct from old.id
     or new.staff_user_id is distinct from old.staff_user_id
     or new.target_org_id is distinct from old.target_org_id
     or new.reason is distinct from old.reason
     or new.started_at is distinct from old.started_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'Impersonation sessions cannot be edited; only ending a session is allowed'
      using errcode = '42501';
  end if;
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'This impersonation session has already ended' using errcode = '42501';
  end if;
  if old.ended_at is null and new.ended_at is not null and new.ended_at > now() + interval '1 minute' then
    new.ended_at := now();
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_staff_impersonation_session() from public, anon, authenticated;

drop trigger if exists trg_guard_staff_impersonation_session on public.staff_impersonation_sessions;
create trigger trg_guard_staff_impersonation_session
  before insert or update on public.staff_impersonation_sessions
  for each row execute function public.guard_staff_impersonation_session();

drop policy if exists "staff manage own impersonation sessions" on public.staff_impersonation_sessions;
drop policy if exists staff_impersonation_select_own on public.staff_impersonation_sessions;
drop policy if exists staff_impersonation_insert_own on public.staff_impersonation_sessions;
drop policy if exists staff_impersonation_end_own on public.staff_impersonation_sessions;

create policy staff_impersonation_select_own on public.staff_impersonation_sessions
  for select to authenticated
  using (staff_user_id = (select auth.uid()) and public.is_staff((select auth.uid())));

create policy staff_impersonation_insert_own on public.staff_impersonation_sessions
  for insert to authenticated
  with check (staff_user_id = (select auth.uid()) and public.is_staff((select auth.uid())));

create policy staff_impersonation_end_own on public.staff_impersonation_sessions
  for update to authenticated
  using (staff_user_id = (select auth.uid()) and public.is_staff((select auth.uid())))
  with check (staff_user_id = (select auth.uid()) and public.is_staff((select auth.uid())));

-- No DELETE policy, and no DELETE/TRUNCATE privilege for end users.
revoke delete, truncate on table public.staff_impersonation_sessions from anon, authenticated;

-- TEST seed: TEST has no platform staff org / staff users today, so the
-- allowlist starts empty there. (PROD seed: see header.)
