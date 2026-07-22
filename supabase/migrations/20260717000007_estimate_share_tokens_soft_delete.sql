-- estimate_share_tokens was created without deleted_at/updated_at, violating the
-- standard table convention. useEstimateShareTokens() filters on deleted_at,
-- which errors on every call (42703 column does not exist) since the table
-- has never had that column.

ALTER TABLE estimate_share_tokens
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TRIGGER trg_estimate_share_tokens_updated_at
  BEFORE UPDATE ON estimate_share_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
