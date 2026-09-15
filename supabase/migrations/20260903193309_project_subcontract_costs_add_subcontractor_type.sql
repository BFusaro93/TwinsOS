ALTER TABLE public.project_subcontract_costs
  DROP CONSTRAINT IF EXISTS project_subcontract_costs_cost_type_check;

ALTER TABLE public.project_subcontract_costs
  ADD CONSTRAINT project_subcontract_costs_cost_type_check
  CHECK (cost_type = ANY (ARRAY['materials'::text, 'labor'::text, 'subcontractor'::text, 'other'::text]));
