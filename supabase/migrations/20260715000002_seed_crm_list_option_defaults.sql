-- Cancellation reasons, contact types, and payment methods used to be client-side-only
-- defaults (never persisted), so they reset on every page refresh. Backfill them into
-- crm_list_options — the same DB-backed table already used for client_sources etc. —
-- for every existing org, so nothing appears to disappear once the UI switches over.
insert into crm_list_options (org_id, list_name, value, sort_order)
select o.id, v.list_name, v.value, v.sort_order
from organizations o
cross join (values
  ('cancellation_reasons', 'Price', 0),
  ('cancellation_reasons', 'Moved', 1),
  ('cancellation_reasons', 'Unhappy with service', 2),
  ('cancellation_reasons', 'No longer needs service', 3),
  ('contact_types', 'Owner', 0),
  ('contact_types', 'Billing contact', 1),
  ('contact_types', 'Site manager', 2),
  ('contact_types', 'Decision maker', 3),
  ('contact_types', 'Other', 4),
  ('payment_methods', 'ACH/E-Check', 0),
  ('payment_methods', 'AR Write-off', 1),
  ('payment_methods', 'AutoPay', 2),
  ('payment_methods', 'Cash', 3),
  ('payment_methods', 'Check', 4),
  ('payment_methods', 'Credit Card- AmEx', 5),
  ('payment_methods', 'Credit Card- Discover', 6),
  ('payment_methods', 'Credit Card- MasterCard', 7),
  ('payment_methods', 'Credit Card- Visa', 8),
  ('payment_methods', 'Other', 9)
) as v(list_name, value, sort_order)
on conflict (org_id, list_name, value) do nothing;
