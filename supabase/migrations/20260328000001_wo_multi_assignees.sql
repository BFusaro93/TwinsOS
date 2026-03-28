-- Add multi-assignee support to work orders.
-- The new JSONB arrays store all assigned user IDs/names.
-- The existing assigned_to_id / assigned_to_name columns are kept for
-- backward compatibility (always reflect the first assignee).

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS assigned_to_ids jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS assigned_to_names jsonb NOT NULL DEFAULT '[]';

-- Back-fill existing rows: copy the single assignee into the new arrays
UPDATE public.work_orders
SET
  assigned_to_ids   = CASE WHEN assigned_to_id IS NOT NULL THEN jsonb_build_array(assigned_to_id) ELSE '[]' END,
  assigned_to_names = CASE WHEN assigned_to_name IS NOT NULL THEN jsonb_build_array(assigned_to_name) ELSE '[]' END
WHERE assigned_to_ids = '[]';
