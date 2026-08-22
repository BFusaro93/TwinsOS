-- Rate limiting for the Zapier API surface — key generation aside, every
-- Zapier-facing route (hooks subscribe/unsubscribe, triggers polling, and
-- the create-client/job/ticket/work-order/requisition/client-note actions)
-- was reachable an unlimited number of times per minute with just the org's
-- API key. A leaked or self-issued key (see 20260902000001_integrations_
-- admin_only.sql) could otherwise be used to mass-create records or hammer
-- the DB with no throttling at all.
--
-- Fixed 60-second window, one counter row per (integration, window),
-- incremented atomically via UPSERT so concurrent requests in the same
-- window can't race past the limit. Enforced in
-- src/lib/integrations/zapier.ts's checkZapierRateLimit(), called from
-- every Zapier route right after authenticateZapierRequest() succeeds.

create table public.zapier_rate_limit_counters (
  integration_id uuid        not null references public.integrations(id) on delete cascade,
  window_start   timestamptz not null,
  count          int         not null default 0,
  primary key (integration_id, window_start)
);

-- Only ever touched via the service-role client (see adminClient() in
-- zapier.ts) — RLS enabled with no policies so it's deny-by-default for any
-- other caller, consistent with "RLS is always enabled" project convention.
alter table public.zapier_rate_limit_counters enable row level security;

create index idx_zapier_rate_limit_window on public.zapier_rate_limit_counters (window_start);

create or replace function public.zapier_rate_limit_hit(
  p_integration_id uuid,
  p_window_start   timestamptz,
  p_limit          int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.zapier_rate_limit_counters (integration_id, window_start, count)
  values (p_integration_id, p_window_start, 1)
  on conflict (integration_id, window_start)
  do update set count = zapier_rate_limit_counters.count + 1
  returning count into v_count;

  -- Opportunistic cleanup so this table doesn't grow unbounded — cheap
  -- (indexed range delete) and only run on a small fraction of calls rather
  -- than adding a dedicated cron job for what's a low-priority tidy-up.
  if random() < 0.01 then
    delete from public.zapier_rate_limit_counters
    where window_start < now() - interval '1 hour';
  end if;

  return v_count <= p_limit;
end;
$$;
