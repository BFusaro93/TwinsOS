-- Sub-items can now be shown on the client-facing estimate (PDF / emailed copy),
-- like Service Autopilot's per-sub-item print toggle. print_on_invoice already
-- exists for invoices.
--
-- Existing sub-items backfill to false so every estimate already sent or saved
-- prints exactly as it did before; new sub-items default to true.

ALTER TABLE public.estimate_line_item_subitems
  ADD COLUMN IF NOT EXISTS print_on_estimate boolean NOT NULL DEFAULT false;

ALTER TABLE public.estimate_line_item_subitems
  ALTER COLUMN print_on_estimate SET DEFAULT true;
