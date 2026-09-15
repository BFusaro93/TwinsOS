-- Tracks Ask AI support-widget chat requests per org per calendar day,
-- enforcing a daily cap so no single org (or a runaway client) can run up
-- the shared ANTHROPIC_API_KEY bill. Mirrors organization_ai_draft_usage /
-- try_increment_ai_draft_usage() (20260824015557) but kept as a separate
-- table/RPC since it's a distinct feature with its own limit — chat
-- requests are cheaper per call than estimate-draft generation, so the cap
-- is higher.

create table if not exists organization_ai_chat_usage (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) default my_org_id(),
  usage_date date not null,
  count      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, usage_date)
);

create index if not exists idx_organization_ai_chat_usage_org on organization_ai_chat_usage (org_id);

alter table organization_ai_chat_usage enable row level security;

drop policy if exists "org members can read ai chat usage" on organization_ai_chat_usage;
create policy "org members can read ai chat usage" on organization_ai_chat_usage
  for select using (org_id = my_org_id());

-- No insert/update/delete policy for regular authenticated users — the only
-- write path is try_increment_ai_chat_usage() below (security definer),
-- called from the support/ask route with the requesting user's own org_id.

create or replace function public.try_increment_ai_chat_usage(p_org_id uuid, p_day date, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into organization_ai_chat_usage (org_id, usage_date, count)
  values (p_org_id, p_day, 1)
  on conflict (org_id, usage_date)
  do update set count = organization_ai_chat_usage.count + 1, updated_at = now()
    where organization_ai_chat_usage.count < p_limit
  returning count into new_count;

  return new_count is not null;
end;
$$;
