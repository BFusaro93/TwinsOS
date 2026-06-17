-- Add labor_hours to projects for net profit calculation.
-- Net profit = contract_price - material_costs - (labor_hours × breakeven_rate)
alter table public.projects
  add column if not exists labor_hours numeric;
