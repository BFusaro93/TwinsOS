-- Two overloads of receive_part_quantity now coexist: the old 6-arg
-- (p_new_unit_cost, p_new_cost_layers) signature superseded by the
-- atomic_cost_layer_receiving migration, and the new 7-arg signature the
-- frontend actually calls. Nothing in the app calls the old signature
-- anymore (only src/types/supabase.ts, a generated file) and per the
-- existing drop_legacy_adjust_part_quantity_overload precedent, leaving a
-- stale overload around risks PostgREST's "Could not choose the best
-- candidate function" ambiguity error on schema cache reloads.
drop function if exists public.receive_part_quantity(uuid, uuid, integer, integer, jsonb, text);
