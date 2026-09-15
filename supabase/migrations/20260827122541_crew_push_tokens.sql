-- crew_push_tokens: stores each crew member's Expo push token so a future
-- server-side trigger can send them a push notification (new assignment,
-- dispatcher note, requisition approved/rejected — see the stub at
-- src/lib/notifications/send-push.ts, which nothing calls yet). This
-- migration only adds registration/storage; no sending is wired up.
--
-- One row per user (upserted by user_id) — a crew login is a single shared
-- tablet in practice, and re-registering (reinstall, token rotation) should
-- overwrite the previous token rather than accumulate stale rows.
create table if not exists public.crew_push_tokens (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references public.organizations(id),
  user_id           uuid        not null unique references public.profiles(id),
  expo_push_token   text        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_crew_push_tokens_updated_at
  before update on public.crew_push_tokens
  for each row execute function public.set_updated_at();

create index if not exists idx_crew_push_tokens_org on public.crew_push_tokens(org_id);

alter table public.crew_push_tokens enable row level security;

-- Per-device registration data, not an org-wide resource — a user (any
-- role, crew included) may only ever see/manage their own token row. No
-- role restriction needed here the way requisitions/vendors/etc. now
-- exclude 'crew' (see 20260824114014_restrict_crew_role_from_financial_
-- tables.sql) — this table carries no business data.
create policy "own_push_tokens_select" on public.crew_push_tokens for select
  using (user_id = auth.uid());
create policy "own_push_tokens_insert" on public.crew_push_tokens for insert
  with check (user_id = auth.uid() and org_id = public.my_org_id());
create policy "own_push_tokens_update" on public.crew_push_tokens for update
  using (user_id = auth.uid());
create policy "own_push_tokens_delete" on public.crew_push_tokens for delete
  using (user_id = auth.uid());
