-- Soft delete for estimate_direct_costs (CLAUDE.md: soft deletes only).
-- The UI previously hard-deleted rows. No view or SQL function reads this
-- table (verified by grepping migrations), so only the column is needed; all
-- TypeScript readers filter deleted_at IS NULL. The audit trigger already
-- narrates a deleted_at transition as a 'deleted' action generically.
ALTER TABLE public.estimate_direct_costs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_estimate_direct_costs_estimate_live
  ON public.estimate_direct_costs (estimate_id)
  WHERE deleted_at IS NULL;
