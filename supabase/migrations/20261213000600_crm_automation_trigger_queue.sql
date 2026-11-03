-- Bulk client actions (tag, cancel, activate, bulk edit) can touch thousands of
-- clients, and each one may fire an automation trigger. Firing them inside the
-- request (or from the browser, 50 at a time) either timed out or was lost when
-- the tab closed. /api/crm/clients/bulk now queues one row per client event here
-- and /api/automations/run drains the queue every 15 minutes.
-- Server-only (admin client): RLS on, no policies, same deliberate deny-all
-- shape as the other service-role tables.
create table if not exists public.crm_automation_trigger_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  client_id uuid not null references public.clients(id),
  trigger_type text not null,
  match_values text[],
  attempts integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists crm_automation_trigger_queue_pending_idx
  on public.crm_automation_trigger_queue (created_at) where processed_at is null;
alter table public.crm_automation_trigger_queue enable row level security;
revoke all on public.crm_automation_trigger_queue from anon, authenticated;
