-- QuickBooks sync Phase 5: per-service QBO item mapping. An invoice line
-- whose name exactly matches a crm_services.name (case-insensitive) gets
-- its own dedicated QBO Service item instead of the shared "Services"
-- catchall, so QuickBooks-side reporting breaks down by service type.
-- Unmatched lines (ad-hoc/free-text) still fall back to the catchall item.
ALTER TABLE public.crm_services ADD COLUMN IF NOT EXISTS qbo_item_id text;
CREATE UNIQUE INDEX IF NOT EXISTS crm_services_qbo_item_id_idx
  ON public.crm_services (qbo_item_id) WHERE qbo_item_id IS NOT NULL;
