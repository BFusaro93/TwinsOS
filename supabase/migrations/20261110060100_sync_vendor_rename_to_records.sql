-- Renaming a vendor left its name stale everywhere it is denormalized.
--
-- Parts, catalog products, requisitions, purchase orders, WO vendor charges,
-- project subcontract costs, goods receipts and asset/vehicle purchase vendors
-- each keep a copy of the vendor's name next to vendor_id (needed for display
-- once a vendor is soft-deleted). Nothing refreshed those copies, so after
-- "ABC Supply" was renamed "ABC Supply Co" the Parts and Products pages, the PO
-- list, vendor filters and PO PDFs kept showing the old name until each record
-- was individually re-saved — and the vendor filter dropdowns listed BOTH names
-- for one vendor.
--
-- AFTER UPDATE OF name on vendors now rewrites the copy on every row that links
-- the vendor by id. Rows with no vendor_id (free-text names) are untouched.
-- SECURITY DEFINER so a rename isn't blocked by the renamer's table-level
-- permissions on e.g. purchase orders; scoped to the vendor's own org.
-- app.approval_rpc is raised around the PO/requisition updates because a
-- non-admin renamer would otherwise be judged by guard_procurement_approval_status
-- as if they were editing a PO past approval (it only checks status/total
-- transitions, none of which change here).
create or replace function public.sync_vendor_name_to_records()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  update public.parts set vendor_name = new.name
    where vendor_id = new.id and org_id = new.org_id and vendor_name is distinct from new.name;
  update public.product_items set vendor_name = new.name
    where vendor_id = new.id and org_id = new.org_id and vendor_name is distinct from new.name;
  -- Alternate vendors are [{vendorId, vendorName}] jsonb on parts and products.
  update public.parts set alternate_vendors = (
      select jsonb_agg(case when e->>'vendorId' = new.id::text then jsonb_set(e, '{vendorName}', to_jsonb(new.name)) else e end)
        from jsonb_array_elements(alternate_vendors) e)
    where org_id = new.org_id and jsonb_typeof(alternate_vendors) = 'array'
      and exists (select 1 from jsonb_array_elements(alternate_vendors) e
                   where e->>'vendorId' = new.id::text and e->>'vendorName' is distinct from new.name);
  update public.product_items set alternate_vendors = (
      select jsonb_agg(case when e->>'vendorId' = new.id::text then jsonb_set(e, '{vendorName}', to_jsonb(new.name)) else e end)
        from jsonb_array_elements(alternate_vendors) e)
    where org_id = new.org_id and jsonb_typeof(alternate_vendors) = 'array'
      and exists (select 1 from jsonb_array_elements(alternate_vendors) e
                   where e->>'vendorId' = new.id::text and e->>'vendorName' is distinct from new.name);
  update public.wo_vendor_charges set vendor_name = new.name
    where vendor_id = new.id and org_id = new.org_id and vendor_name is distinct from new.name;
  update public.project_subcontract_costs set vendor_name = new.name
    where vendor_id = new.id and org_id = new.org_id and vendor_name is distinct from new.name;
  update public.assets set purchase_vendor_name = new.name
    where purchase_vendor_id = new.id and org_id = new.org_id and purchase_vendor_name is distinct from new.name;
  update public.vehicles set purchase_vendor_name = new.name
    where purchase_vendor_id = new.id and org_id = new.org_id and purchase_vendor_name is distinct from new.name;

  perform set_config('app.approval_rpc', 'on', true);
  update public.requisitions set vendor_name = new.name
    where vendor_id = new.id and org_id = new.org_id and vendor_name is distinct from new.name;
  update public.purchase_orders set vendor_name = new.name
    where vendor_id = new.id and org_id = new.org_id and vendor_name is distinct from new.name;
  perform set_config('app.approval_rpc', '', true);

  -- Receipts carry the name but not the vendor id; reach them through their PO.
  update public.goods_receipts gr set vendor_name = new.name
    from public.purchase_orders po
    where gr.purchase_order_id = po.id
      and po.vendor_id = new.id and po.org_id = new.org_id
      and gr.vendor_name is distinct from new.name;

  return new;
end;
$function$;

revoke all on function public.sync_vendor_name_to_records() from public, anon, authenticated;

drop trigger if exists trg_vendors_sync_name_to_records on public.vendors;
create trigger trg_vendors_sync_name_to_records
  after update of name on public.vendors
  for each row
  when (old.name is distinct from new.name)
  execute function public.sync_vendor_name_to_records();
