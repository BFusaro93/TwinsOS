-- estimate_line_item_subitems was missed by 20260716000011_fix_org_id_default_drift.sql —
-- inserts from useUpsertSubitem() never set org_id, so RLS WITH CHECK rejects them (42501).
alter table public.estimate_line_item_subitems
  alter column org_id set default public.my_org_id();
