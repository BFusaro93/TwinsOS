-- Add multi-category support to work orders.
-- The new JSONB array stores all assigned category IDs.
-- The existing category column is kept for backward compatibility
-- (always reflects the first category).

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]';

-- Back-fill existing rows: copy the single category into the new array
UPDATE public.work_orders
SET categories = CASE WHEN category IS NOT NULL THEN jsonb_build_array(category) ELSE '[]' END
WHERE categories = '[]';
