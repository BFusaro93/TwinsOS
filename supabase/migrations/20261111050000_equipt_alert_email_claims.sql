-- Once-per-event ledger for the Equipt alert digest emails (low stock, PM due,
-- work order overdue). One row = "this user was already emailed about this
-- entity for this event". The crons insert before sending (so overlapping runs
-- can't double-send) and delete the rows again if the send fails.
--
--   low_stock        event_key '' — the row is deleted when the item recovers
--                    above its minimum, so it can alert again next time it dips.
--   pm_due           event_key = next_due_date — a completed PM rolls the due
--                    date forward, which is a new event.
--   work_order_overdue  event_key = due_date — re-dating an overdue WO re-alerts.
--
-- Written only by the service role from cron routes: RLS is on with no
-- policies (deny-all to anon/authenticated), same as the other server-only
-- ledgers. Rows are a dedupe ledger, not business records, so recovery and
-- pruning hard-delete them.

create table if not exists public.equipt_alert_email_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null check (alert_type in ('low_stock', 'pm_due', 'work_order_overdue')),
  entity_type text not null check (entity_type in ('part', 'product_item', 'pm_schedule', 'work_order')),
  entity_id uuid not null,
  event_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create unique index if not exists equipt_alert_email_claims_unique
  on public.equipt_alert_email_claims (user_id, alert_type, entity_type, entity_id, event_key);
create index if not exists equipt_alert_email_claims_org_type
  on public.equipt_alert_email_claims (org_id, alert_type);

alter table public.equipt_alert_email_claims enable row level security;
revoke all on public.equipt_alert_email_claims from anon, authenticated;
