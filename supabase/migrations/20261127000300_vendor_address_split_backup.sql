-- Holds each vendor's address exactly as it was typed before it was split into
-- street / city / state / zip, so the split can be undone or audited.
-- Internal one-off: RLS on with no policies = no API access, the same
-- deny-all pattern as the other internal snapshot tables.

create table if not exists public.vendor_address_split_backup (
  id               uuid primary key default gen_random_uuid(),
  vendor_id        uuid not null references public.vendors(id),
  org_id           uuid not null references public.organizations(id),
  original_address text not null,
  split_street     text not null default '',
  split_city       text not null default '',
  split_state      text not null default '',
  split_zip        text not null default '',
  split_at         timestamptz not null default now()
);

create index if not exists vendor_address_split_backup_vendor_idx
  on public.vendor_address_split_backup (vendor_id);

alter table public.vendor_address_split_backup enable row level security;
revoke all on public.vendor_address_split_backup from anon, authenticated;
