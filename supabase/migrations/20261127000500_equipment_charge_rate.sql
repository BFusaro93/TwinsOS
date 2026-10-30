-- Equipment can carry a CHARGE rate (what the company intends to recover) next
-- to its COST rate. $500/day charge on a $400/day machine = $100/day margin.
-- NULL charge means "no markup" (charge = cost), so existing rows keep working.
-- The line-level column is a snapshot, like name/unit/rate_cents.
alter table public.crm_equipment
  add column if not exists charge_rate_cents integer check (charge_rate_cents is null or charge_rate_cents >= 0);

alter table public.estimate_line_item_equipment
  add column if not exists charge_rate_cents integer check (charge_rate_cents is null or charge_rate_cents >= 0);
