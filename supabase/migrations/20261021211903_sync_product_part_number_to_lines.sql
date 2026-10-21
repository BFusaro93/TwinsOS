-- po_line_items / requisition_line_items keep their own copy of the product's
-- part_number (snapshotted when the line is added). Editing the part number on
-- the Product afterwards never reached those copies, so POs and project
-- Materials kept showing the old (blank) value. useUpdateProduct already pushes
-- name/part_number to the linked Part; do the same for the lines, in the DB so
-- imports, the API and Part edits are covered too.
-- part_number is a display field: guard_procurement_line_items only fires for
-- quantity / unit_cost / product_item_id / taxable changes, so approved and
-- ordered documents are not re-opened by this.

create or replace function public.sync_product_part_number_to_lines()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.part_number is distinct from OLD.part_number then
    update public.po_line_items
       set part_number = coalesce(NEW.part_number, '')
     where product_item_id = NEW.id
       and part_number is distinct from coalesce(NEW.part_number, '');
    update public.requisition_line_items
       set part_number = coalesce(NEW.part_number, '')
     where product_item_id = NEW.id
       and part_number is distinct from coalesce(NEW.part_number, '');
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_sync_product_part_number_to_lines on public.product_items;
create trigger trg_sync_product_part_number_to_lines
  after update of part_number on public.product_items
  for each row execute function public.sync_product_part_number_to_lines();

-- One-time backfill for lines already out of step with their product.
update public.po_line_items li
   set part_number = p.part_number
  from public.product_items p
 where li.product_item_id = p.id
   and coalesce(p.part_number, '') <> ''
   and li.part_number is distinct from p.part_number;

update public.requisition_line_items li
   set part_number = p.part_number
  from public.product_items p
 where li.product_item_id = p.id
   and coalesce(p.part_number, '') <> ''
   and li.part_number is distinct from p.part_number;
