-- estimate_line_items.complexity_bps (20260918080000) shipped with no range
-- guard. 10000 bps = 100% = no adjustment, and the UI slider only offers
-- 50%-200%, but nothing stopped a direct write (API, import, a future bulk
-- tool) from storing 0 — which prices the line at zero — or a negative value,
-- which produces negative line revenue and a negative estimate total.
--
-- The app now clamps to the same 5000-20000 range on every read and write
-- (clampComplexityBps in src/lib/estimate-calc.ts); this makes it structural so
-- no other writer can reintroduce it. Verified 0 out-of-range rows on PROD and
-- TEST before adding, so this applies without a backfill.
alter table public.estimate_line_items
  drop constraint if exists estimate_line_items_complexity_bps_range;

alter table public.estimate_line_items
  add constraint estimate_line_items_complexity_bps_range
  check (complexity_bps between 5000 and 20000);

-- A negative discount silently INCREASES the line's net instead of reducing it,
-- because the estimate rollup sums (total - discount).
--
-- Added NOT VALID on purpose. PROD has exactly one pre-existing violator —
-- estimate #8, line "Lawn Mowing": total_cents 7500 with discount_cents
-- -27500, no discount_type and no discount_value, so it contributes +$350 to
-- that estimate. Its stored subtotal_cents (50000) already reflects that, so
-- the row is load-bearing for a real customer document: clamping the discount
-- to 0 would silently restate that estimate from $500.00 to $225.00. That is a
-- business decision, not a migration's call. NOT VALID enforces the rule on
-- every future insert and update while leaving the existing row exactly as it
-- is; once someone decides what estimate #8 should say, run
--   alter table public.estimate_line_items
--     validate constraint estimate_line_items_discount_nonnegative;
-- to close it out.
--
-- Deliberately NOT adding the cross-column `discount_cents <= total_cents`
-- constraint that would also be defensible here: total_cents and discount_cents
-- are not always written in the same statement (a price-adjustment run rewrites
-- totals alone), so a cross-column CHECK would reject legitimate multi-step
-- writes mid-flight. The app clamps discount to total on every line write, and
-- recalcEstimateTotals now floors each line's net contribution at 0, which
-- covers the failure this would have caught.
alter table public.estimate_line_items
  drop constraint if exists estimate_line_items_discount_nonnegative;

alter table public.estimate_line_items
  add constraint estimate_line_items_discount_nonnegative
  check (discount_cents >= 0) not valid;
