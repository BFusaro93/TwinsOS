-- Vendors had one free-text `address` column holding the whole run-on address.
-- `address` stays as the street line; city / state / zip get their own columns
-- (same shape as clients, properties, crews and employees). Existing rows are
-- split separately, with a snapshot of the original text, so nothing is lost.

alter table public.vendors
  add column if not exists city  text not null default '',
  add column if not exists state text not null default '',
  add column if not exists zip   text not null default '';

-- Appended at the end so CREATE OR REPLACE VIEW keeps the existing columns.
create or replace view public.rpt_vendors
with (security_invoker = on) as
select
  v.id,
  v.name,
  v.contact_name,
  v.email,
  v.phone,
  v.address,
  v.vendor_type,
  v.is_active,
  v.w9_status,
  v.city,
  v.state,
  v.zip
from public.vendors v
where v.deleted_at is null;
