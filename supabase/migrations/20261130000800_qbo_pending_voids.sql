-- A payment refunded in full loses its allocation row, and with it the only copy of the
-- QuickBooks payment id. If the void in QuickBooks failed there was nothing left to retry.
-- This keeps the id until the void lands. Server-only (admin client): RLS on, no policies,
-- same deliberate deny-all shape as the other service-role tables.
create table if not exists public.crm_qbo_pending_voids (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  payment_id uuid,
  qbo_payment_id text not null,
  last_error text,
  attempted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create unique index if not exists crm_qbo_pending_voids_qbo_payment_id_idx
  on public.crm_qbo_pending_voids (qbo_payment_id);
create index if not exists crm_qbo_pending_voids_open_idx
  on public.crm_qbo_pending_voids (org_id) where resolved_at is null;
alter table public.crm_qbo_pending_voids enable row level security;
revoke all on public.crm_qbo_pending_voids from anon, authenticated;
