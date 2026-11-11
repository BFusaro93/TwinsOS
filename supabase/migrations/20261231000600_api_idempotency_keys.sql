-- Idempotency-Key support for the public API (v1 / MCP) and the Zapier actions.
--
-- A create sent with an `Idempotency-Key` header claims (org_id, key) here
-- before it runs; a retry with the same key and the same request within 24
-- hours gets the stored response back instead of creating a second record
-- (src/lib/api/idempotency.ts). A pending row (response_status null) is a
-- request still in flight — a concurrent duplicate gets 409.
--
-- Service role only, like zapier_rate_limit_counters: RLS on with NO
-- policies, and no grants to anon/authenticated. Expected to show up as an
-- "RLS enabled, no policy" advisor note — that is deliberate (deny-all).
-- Rows are a short-lived replay cache, not business records, so expired rows
-- are hard-deleted by the daily Samsara sync cron (purgeExpiredIdempotencyKeys).

create table if not exists public.api_idempotency_keys (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  key             text not null check (char_length(key) between 1 and 255),
  method          text not null,
  path            text not null,
  request_hash    text not null,
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  constraint api_idempotency_keys_org_key_unique unique (org_id, key)
);

create index if not exists api_idempotency_keys_expires_at_idx
  on public.api_idempotency_keys (expires_at);

alter table public.api_idempotency_keys enable row level security;

revoke all on table public.api_idempotency_keys from anon, authenticated;
grant select, insert, update, delete on table public.api_idempotency_keys to service_role;

comment on table public.api_idempotency_keys is
  'Idempotency-Key replay cache for public API / Zapier creates (src/lib/api/idempotency.ts). Service role only: RLS enabled with no policies by design. Expired rows are purged daily.';
