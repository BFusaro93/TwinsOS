-- Estimate photos are internal-only today — no way to mark one as
-- customer-facing so it shows on the PDF / public proposal page.
ALTER TABLE public.estimate_photos
  ADD COLUMN IF NOT EXISTS customer_facing boolean NOT NULL DEFAULT false;
