-- Lets a job product's used quantity (qty, which drives the inventory
-- decrement in set_job_product_status) differ from what's actually billed
-- to the client — e.g. 5 bags of mulch used on site but only 4 invoiced,
-- keeping 1 as unbilled overage. NULL means "invoice the same qty as used",
-- preserving the existing default behavior for every row that doesn't
-- explicitly override it.
ALTER TABLE public.crm_job_products
  ADD COLUMN invoice_qty numeric;
