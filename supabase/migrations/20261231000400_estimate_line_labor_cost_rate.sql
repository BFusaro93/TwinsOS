-- Estimate lines: a line-level labor cost rate (cents per man-hour).
--
-- The man-hour calculator's "Adjust Cost" used to turn "cost this line at
-- $X/man-hr" into a per-UNIT cost (cost_cents), which is whole cents. On a
-- square-foot line that rounding is enormous: 2 hrs at $67.14/hr on a
-- 12,000 sq ft line is 13,428c / 12,000 = 1.119c per sq ft, stored as 1c,
-- so the line cost $120.00 instead of $134.28.
--
-- labor_cost_rate_cents keeps the rate the user asked for. While cost_cents is
-- 0 (the line's cost is not typed in by hand) a line with a rate is costed as
-- complexity-scaled budgeted hours x this rate x visits, the same shape as the
-- org break-even auto cost, so the line's cost is exactly hours x rate. A
-- typed per-unit cost (cost_cents > 0) still wins. Integer cents, never float.
alter table public.estimate_line_items
  add column if not exists labor_cost_rate_cents integer;

alter table public.estimate_line_items
  drop constraint if exists estimate_line_items_labor_cost_rate_nonneg;
alter table public.estimate_line_items
  add constraint estimate_line_items_labor_cost_rate_nonneg
  check (labor_cost_rate_cents is null or labor_cost_rate_cents >= 0);

comment on column public.estimate_line_items.labor_cost_rate_cents is
  'Line labor cost per man-hour (cents). Used when cost_cents = 0: total cost = scaled budgeted hours x rate x visits. NULL = use the org break-even rate.';
