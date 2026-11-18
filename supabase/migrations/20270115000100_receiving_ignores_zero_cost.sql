-- Receiving a PO line at $0 (review 2026-11-17).
--
-- 20270112000100 / #537 made work-order pricing ignore $0 cost layers and fall back to the catalog
-- cost, but receiving still wrote a $0 layer and — in FIFO/manual mode — set the part's (and its
-- product's) catalog cost to $0, and WAC averaged the $0 layer in. The fallback then fell back to
-- that same $0.
--
-- A $0 receipt now adds the stock but writes NO cost layer and never changes the catalog cost.
-- Patched onto the LIVE function bodies (pg_get_functiondef + replace), so every guard added by
-- later migrations is kept; each needle must match exactly once or the migration aborts.

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.receive_part_quantity(uuid,uuid,integer,integer,text,text,text,uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);', ''))) <> length('v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);')
     or (length(v_def) - length(replace(v_def, 'v_new_unit_cost := v_unit_cost;', ''))) <> length('v_new_unit_cost := v_unit_cost;') then
    raise exception 'receive_part_quantity body no longer matches the expected text; review before patching';
  end if;
  v_new := replace(v_def,
    'v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);',
    'v_new_layers := case when v_unit_cost > 0 then v_current_layers || jsonb_build_array(v_new_layer) else v_current_layers end;');
  v_new := replace(v_new,
    'v_new_unit_cost := v_unit_cost;',
    'v_new_unit_cost := case when v_unit_cost > 0 then v_unit_cost else v_old_cost end;');
  execute v_new;

  v_def := pg_get_functiondef('public.receive_product_receipt(uuid,uuid,numeric,integer,text,text,text,uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);', ''))) <> length('v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);')
     or (length(v_def) - length(replace(v_def, 'v_new_unit_cost := v_unit_cost;', ''))) <> length('v_new_unit_cost := v_unit_cost;') then
    raise exception 'receive_product_receipt body no longer matches the expected text; review before patching';
  end if;
  v_new := replace(v_def,
    'v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);',
    'v_new_layers := case when v_unit_cost > 0 then v_current_layers || jsonb_build_array(v_new_layer) else v_current_layers end;');
  v_new := replace(v_new,
    'v_new_unit_cost := v_unit_cost;',
    'v_new_unit_cost := case when v_unit_cost > 0 then v_unit_cost else v_current_unit_cost end;');
  execute v_new;
end $$;
