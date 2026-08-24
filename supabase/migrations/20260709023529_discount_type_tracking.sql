-- Track discount TYPE (percent vs flat) and, when chosen from the saved
-- discount catalog, WHICH preset was applied — not just the resolved cents
-- amount. Needed for reporting ("what kinds of discounts did we give out
-- this month"). Added consistently at both the whole-document level
-- (crm_invoices, estimates) and the per-line-item level, so reporting
-- doesn't have to special-case one or the other.
--
-- discount_value is stored in the unit matching discount_type: cents when
-- flat, basis points when percent (same convention as crm_discounts.flat_cents
-- / percent_bps). applied_discount_id is null for a manually-typed amount.

alter table crm_invoices
  add column if not exists discount_type text check (discount_type in ('percent','flat')),
  add column if not exists discount_value integer,
  add column if not exists applied_discount_id uuid references crm_discounts(id) on delete set null;

alter table estimates
  add column if not exists discount_type text check (discount_type in ('percent','flat')),
  add column if not exists discount_value integer,
  add column if not exists applied_discount_id uuid references crm_discounts(id) on delete set null;

alter table crm_invoice_line_items
  add column if not exists discount_type text check (discount_type in ('percent','flat')),
  add column if not exists discount_value integer,
  add column if not exists applied_discount_id uuid references crm_discounts(id) on delete set null;

alter table estimate_line_items
  add column if not exists discount_type text check (discount_type in ('percent','flat')),
  add column if not exists discount_value integer,
  add column if not exists applied_discount_id uuid references crm_discounts(id) on delete set null;
