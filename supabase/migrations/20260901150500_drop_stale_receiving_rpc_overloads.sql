-- 20260901150000 added an optional p_po_line_item_id parameter to
-- receive_part_quantity()/receive_product_cost_layer() via `create or
-- replace function`. As already documented in
-- 20260901081000_drop_stale_number_rpc_overloads.sql, `create or replace
-- function` does NOT replace a function when the parameter list changes —
-- it creates a second overload alongside the original 7-arg signature. Any
-- caller that doesn't pass p_po_line_item_id (an old cached client bundle,
-- a future integration, or PostgREST resolving ambiguously) could still hit
-- the unprotected 7-arg version, defeating the over-receipt guard entirely,
-- or PostgREST could fail the call outright with PGRST203 ("Could not
-- choose the best candidate function"). Drop the stale 7-arg overloads so
-- only the guarded 8-arg versions remain.
drop function if exists public.receive_part_quantity(
  p_org_id uuid,
  p_part_id uuid,
  p_quantity integer,
  p_layer_unit_cost integer,
  p_received_at text,
  p_po_number text,
  p_cost_method text
);
drop function if exists public.receive_product_cost_layer(
  p_org_id uuid,
  p_product_id uuid,
  p_layer_quantity numeric,
  p_layer_unit_cost integer,
  p_received_at text,
  p_po_number text,
  p_cost_method text
);
