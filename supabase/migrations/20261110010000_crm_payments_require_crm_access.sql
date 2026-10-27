-- crm_payments was left out of the has_crm_access() tightening
-- (20260906150001 rewrote crm_invoices / client tables inline, and
-- 20260906210000 added a RESTRICTIVE "require_crm_access" policy to 66 more
-- tables — crm_payment_allocations among them — but never crm_payments).
--
-- Result: any active member of an org whose profile has no live
-- crm_employees/crm_roles link (e.g. an Equipt-only manager or purchaser, who
-- is refused every Landscapt page in the UI) could still read EVERY customer
-- payment in the org, and insert/update them, straight through the REST API.
-- Verified on PROD with a rollback sentinel: for such a user
-- has_crm_access() = false, crm_invoices and crm_payment_allocations return 0
-- rows, crm_payments returns all of the org's payments.
--
-- Same fix as the sibling tables: a RESTRICTIVE policy ANDed against the
-- existing permissive ones, so nothing about the current policies has to be
-- reproduced. Admins and crew keep has_crm_access() = true (crew are already
-- excluded from this table by the permissive policies' my_role() check), and
-- portal customers have no permissive policy on crm_payments at all, so they
-- are unaffected. The service role bypasses RLS, so webhooks, crons and the
-- refund route are unaffected.

drop policy if exists "require_crm_access" on public.crm_payments;
create policy "require_crm_access" on public.crm_payments
  as restrictive
  for all
  using (public.has_crm_access())
  with check (public.has_crm_access());
