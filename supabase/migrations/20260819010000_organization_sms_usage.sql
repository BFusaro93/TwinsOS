-- Tracks SMS sends per org per calendar month, feeding the SMS add-on's
-- 500-included / $10-per-250-over overage billing (Phase 3 of the
-- subscription tier work). increment_sms_usage() is a single atomic
-- upsert+increment so concurrent sends (automations firing in parallel)
-- can't race and lose a count under a plain read-then-write.

create table if not exists organization_sms_usage (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) default my_org_id(),
  period_start         date not null,
  count                integer not null default 0,
  overage_billed_cents integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, period_start)
);

create index if not exists idx_organization_sms_usage_org on organization_sms_usage (org_id);

alter table organization_sms_usage enable row level security;

create policy "org members can read sms usage" on organization_sms_usage
  for select using (org_id = my_org_id());

-- Writes come only from sendClientSms (service-role Supabase client, same as
-- the rest of the automations/SMS send path) and the daily overage-billing
-- cron — no insert/update/delete policy for regular authenticated users.

create or replace function public.increment_sms_usage(p_org_id uuid, p_period_start date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into organization_sms_usage (org_id, period_start, count)
  values (p_org_id, p_period_start, 1)
  on conflict (org_id, period_start)
  do update set count = organization_sms_usage.count + 1, updated_at = now();
$$;
