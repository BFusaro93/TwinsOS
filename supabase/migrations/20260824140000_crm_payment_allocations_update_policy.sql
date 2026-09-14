-- crm_payment_allocations got select/insert/delete RLS policies
-- (20260707232721_crm_payment_allocations.sql) but no update policy — an
-- UPDATE with no matching policy matches zero rows and returns success with
-- no error, so the invoice-merge route's reassignment of a child invoice's
-- payment allocations to the parent (src/app/api/crm/invoices/merge/route.ts)
-- silently did nothing: the allocation stayed pointed at the now-void child
-- invoice instead of moving to the parent.
create policy "org members can update payment allocations" on crm_payment_allocations
  for update using (org_id = my_org_id());
