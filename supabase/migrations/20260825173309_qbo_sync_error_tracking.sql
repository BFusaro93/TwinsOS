-- QuickBooks sync Phase 4: per-record error tracking for the reconciliation
-- panel. integrations.last_sync_status/last_sync_at is org-wide only and
-- can't say WHICH invoice/payment failed or why -- these columns let the
-- Sync Status panel list specific failures with a reason and support a
-- per-row manual retry.
ALTER TABLE public.crm_invoices
  ADD COLUMN IF NOT EXISTS qbo_sync_error text,
  ADD COLUMN IF NOT EXISTS qbo_sync_attempted_at timestamptz;

ALTER TABLE public.crm_payment_allocations
  ADD COLUMN IF NOT EXISTS qbo_sync_error text,
  ADD COLUMN IF NOT EXISTS qbo_sync_attempted_at timestamptz;
