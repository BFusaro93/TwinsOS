-- Project materials that aren't stock-tracked (category 'project_material',
-- is_inventory = false) are bought per job, not held on a shelf, so FIFO/WAC
-- cost layers make no sense for them. Their catalog unit_cost is simply the
-- cost on the most recent PO line for that product. Stock-tracked products and
-- maintenance parts keep the receiving-driven layer costing untouched.
--
-- New products created from the app start at $0 and nothing ever filled them
-- in unless the PO was received, so projects showed $0 catalog costs.

create or replace function public.sync_project_material_cost_from_po_line()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cost integer;
begin
  if NEW.product_item_id is null then
    return NEW;
  end if;

  select round(l.unit_cost)::integer into v_cost
    from public.po_line_items l
    join public.purchase_orders po on po.id = l.po_id
   where l.product_item_id = NEW.product_item_id
     and po.status <> 'canceled'
     and po.deleted_at is null
     and l.unit_cost > 0
   order by l.created_at desc, l.id desc
   limit 1;

  if v_cost is not null then
    update public.product_items
       set unit_cost = v_cost
     where id = NEW.product_item_id
       and category = 'project_material'
       and is_inventory = false
       and unit_cost is distinct from v_cost;
  end if;
  return NEW;
end;
$function$;

revoke all on function public.sync_project_material_cost_from_po_line() from public, anon, authenticated;

drop trigger if exists trg_sync_project_material_cost_from_po_line on public.po_line_items;
create trigger trg_sync_project_material_cost_from_po_line
  after insert or update of unit_cost, product_item_id on public.po_line_items
  for each row execute function public.sync_project_material_cost_from_po_line();

-- Backfill: only products still at $0 (don't overwrite costs someone set).
update public.product_items p
   set unit_cost = s.cost
  from (
    select distinct on (l.product_item_id) l.product_item_id, round(l.unit_cost)::integer as cost
      from public.po_line_items l
      join public.purchase_orders po on po.id = l.po_id
     where po.status <> 'canceled' and po.deleted_at is null and l.unit_cost > 0
     order by l.product_item_id, l.created_at desc, l.id desc
  ) s
 where p.id = s.product_item_id
   and p.category = 'project_material'
   and p.is_inventory = false
   and p.deleted_at is null
   and coalesce(p.unit_cost, 0) = 0;
