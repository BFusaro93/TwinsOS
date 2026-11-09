-- QuickBooks payment links are unique PER ORG, not globally.
--
-- crm_payment_allocations_qbo_payment_id_idx (20260825171546) was a global
-- unique index on qbo_payment_id. QuickBooks Payment ids are per company
-- (small integers like "145"), so two Landscapt orgs connected to two
-- different QuickBooks companies routinely receive the same id. The second
-- org's link write then hit the unique violation — and because the push never
-- checked that write's error, the payment was counted as pushed with no link,
-- and the cron created it in QuickBooks again every run.
--
-- crm_qbo_pending_voids already moved to (org_id, qbo_payment_id) in
-- 20261205000100; this does the same for the allocations.
create unique index if not exists crm_payment_allocations_org_qbo_payment_id_idx
  on public.crm_payment_allocations (org_id, qbo_payment_id)
  where qbo_payment_id is not null;

drop index if exists public.crm_payment_allocations_qbo_payment_id_idx;
