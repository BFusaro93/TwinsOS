-- Product-level SELLING-tax flag. When a product becomes a client invoice
-- line, the line's is_taxable is copied from this column (previously always
-- false). Not related to the purchasing-tax `taxable` flag on PO line items.
--
-- Existing rows backfill to false so no existing invoice behaviour changes;
-- NEW products default to true.
ALTER TABLE public.product_items
  ADD COLUMN IF NOT EXISTS is_taxable boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_items
  ALTER COLUMN is_taxable SET DEFAULT true;

COMMENT ON COLUMN public.product_items.is_taxable IS
  'Whether this product is taxable when sold on a client invoice (copied to crm_invoice_line_items.is_taxable). Existing rows were backfilled false; new rows default true.';
