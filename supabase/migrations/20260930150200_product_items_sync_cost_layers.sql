-- ============================================================
-- Products: keep cost_layers in step with quantity_on_hand.
--
-- Same safety net parts got in 20260927130300. On PROD 176 live products had
-- layer quantities that did not sum to quantity_on_hand (and 159 had stock
-- but no layers at all): receipts wrote each layer twice (fixed in the
-- receiving RPCs), and other writers (CSV import, product form, direct
-- quantity edits) changed quantity_on_hand without touching the layers.
--
-- BEFORE INSERT/UPDATE on product_items: when a write changes
-- quantity_on_hand but leaves cost_layers untouched, append a layer at the
-- product's unit_cost (increase) or FIFO-consume (decrease); an insert with an
-- opening quantity gets an opening layer. Writers that set cost_layers in the
-- same UPDATE (the receiving RPCs, adjust_product_item_quantity) are left
-- alone. Existing drift is repaired separately (not a migration).
--
-- Idempotent.
-- ============================================================

create or replace function public.product_items_sync_cost_layers()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_layers    jsonb;
  v_layer_sum numeric;
  v_delta     numeric;
begin
  v_layers := case when jsonb_typeof(NEW.cost_layers) = 'array' then NEW.cost_layers else '[]'::jsonb end;

  if TG_OP = 'INSERT' then
    select coalesce(sum((l ->> 'quantity')::numeric), 0) into v_layer_sum
      from jsonb_array_elements(v_layers) l;
    if coalesce(NEW.quantity_on_hand, 0) > v_layer_sum then
      NEW.cost_layers := v_layers || jsonb_build_array(jsonb_build_object(
        'id', 'layer-' || extract(epoch from clock_timestamp())::text || '-' || substr(gen_random_uuid()::text, 1, 8),
        'poNumber', 'opening-balance',
        'quantity', NEW.quantity_on_hand - v_layer_sum,
        'unitCost', coalesce(NEW.unit_cost, 0),
        'receivedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ));
    end if;
    return NEW;
  end if;

  if NEW.quantity_on_hand is distinct from OLD.quantity_on_hand
     and NEW.cost_layers is not distinct from OLD.cost_layers
  then
    v_delta := coalesce(NEW.quantity_on_hand, 0) - coalesce(OLD.quantity_on_hand, 0);
    if v_delta > 0 then
      NEW.cost_layers := public.append_cost_layer(v_layers, v_delta, coalesce(NEW.unit_cost, 0));
    elsif v_delta < 0 then
      NEW.cost_layers := public.decrement_cost_layers(v_layers, abs(v_delta));
    end if;
  end if;
  return NEW;
end;
$$;

revoke all on function public.product_items_sync_cost_layers() from public, anon, authenticated;

drop trigger if exists trg_product_items_sync_cost_layers on public.product_items;
create trigger trg_product_items_sync_cost_layers
  before insert or update of quantity_on_hand, cost_layers on public.product_items
  for each row execute function public.product_items_sync_cost_layers();
