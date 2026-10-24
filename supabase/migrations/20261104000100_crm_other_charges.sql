-- Other Charges: a catalog of fees (late fee, trip charge, fuel surcharge…)
-- that can be added to invoices singly or in bulk. Mirrors Service Autopilot's
-- Settings > Accounting > Other Charges. A charge is a template only — adding
-- one to an invoice copies name/description/amount/taxable onto a normal
-- crm_invoice_line_items row, so later catalog edits never rewrite history.

create table if not exists public.crm_other_charges (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id() references public.organizations(id),
  name         text not null,
  description  text not null default '',
  amount_cents integer not null default 0 check (amount_cents >= 0),
  is_taxable   boolean not null default false,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_crm_other_charges_org
  on public.crm_other_charges (org_id) where deleted_at is null;

create trigger trg_crm_other_charges_updated_at
  before update on public.crm_other_charges
  for each row execute function public.set_updated_at();

alter table public.crm_other_charges enable row level security;

drop policy if exists "crm_other_charges_select" on public.crm_other_charges;
create policy "crm_other_charges_select" on public.crm_other_charges for select
  using (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_other_charges_insert" on public.crm_other_charges;
create policy "crm_other_charges_insert" on public.crm_other_charges for insert
  with check (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_other_charges_update" on public.crm_other_charges;
create policy "crm_other_charges_update" on public.crm_other_charges for update
  using (org_id = my_org_id() and not public.is_client_portal_user())
  with check (org_id = my_org_id());
-- No DELETE policy: soft deletes only (deleted_at).

drop policy if exists "require_crm_access" on public.crm_other_charges;
create policy "require_crm_access" on public.crm_other_charges
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());
drop policy if exists "read_only_when_canceled_ins" on public.crm_other_charges;
create policy "read_only_when_canceled_ins" on public.crm_other_charges
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.crm_other_charges;
create policy "read_only_when_canceled_upd" on public.crm_other_charges
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);

revoke all on public.crm_other_charges from anon;
