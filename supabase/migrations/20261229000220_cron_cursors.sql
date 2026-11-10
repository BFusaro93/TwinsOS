-- Where a time-budgeted cron run stopped, so the next run resumes there.
--
-- /api/cron/recurring-visits stops starting new orgs after its time budget.
-- It used to begin each day one org further along a sorted list, so when one
-- run could only get through a few orgs, the orgs past them waited until the
-- daily shift happened to reach them — weeks, with many orgs. It now records
-- the org to start with next time.
--
-- System bookkeeping, not tenant data: no org_id, written only by cron routes
-- through the service role. RLS is on with NO policies on purpose (deny-all to
-- every API role; the service role bypasses RLS) — do not add policies.

create table if not exists public.cron_cursors (
  name       text primary key,
  cursor     text,
  updated_at timestamptz not null default now()
);

alter table public.cron_cursors enable row level security;
revoke all on table public.cron_cursors from anon, authenticated;

comment on table public.cron_cursors is
  'Resume point per time-budgeted cron (e.g. recurring-visits: the org id to start with). Service role only; RLS deny-all by design.';
