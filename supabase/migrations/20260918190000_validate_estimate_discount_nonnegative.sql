-- Closes out the NOT VALID constraint added in
-- 20260918110000_estimate_line_item_complexity_bounds.sql.
--
-- That constraint was added NOT VALID because PROD had exactly one violator:
-- estimate #8, line "Lawn Mowing", `total_cents` 7500 with `discount_cents`
-- -27500 and no discount_type/discount_value. Because the rollup sums
-- (total - discount), that line ADDED $350 rather than subtracting, and the
-- estimate's stored subtotal (50000) had been rolled up from it.
--
-- The invoice generated from that estimate was $225.00 — built from the three
-- real line totals (5000 + 7500 + 10000), never seeing the phantom discount.
-- So the line, not the invoice, was the anomaly. The row has been corrected to
-- discount_cents = 0 and the estimate re-rolled to 22500, which now agrees with
-- both its own line items and the invoice already issued against it.
--
-- With no violators left, validate the constraint so it covers existing rows as
-- well as new writes. This is a no-op on TEST, where the constraint was created
-- validated in the first place (that environment never had the bad row).
alter table public.estimate_line_items
  validate constraint estimate_line_items_discount_nonnegative;
