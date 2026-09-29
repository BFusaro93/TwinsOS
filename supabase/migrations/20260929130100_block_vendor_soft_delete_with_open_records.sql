-- The "vendor still has open POs/requisitions" check on vendor delete lived
-- only in the client (useDeleteVendor), so any other caller (API, another UI,
-- a direct update) could soft-delete a vendor and blank its name on in-flight
-- records. Enforce it in the DB: block the transition deleted_at NULL -> set
-- while the vendor still has an open purchase order or requisition.
--
-- Open statuses mirror OPEN_PO_STATUSES / OPEN_REQUISITION_STATUSES in
-- src/lib/hooks/use-vendors.ts (terminal PO statuses: completed, canceled,
-- rejected; terminal requisition statuses: ordered, closed, rejected).
-- SECURITY DEFINER so the check sees every row regardless of the caller's RLS;
-- it is scoped by vendor_id only and reveals just a count.

create or replace function public.block_vendor_delete_with_open_records()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_open_pos  integer;
  v_open_reqs integer;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    select count(*) into v_open_pos
      from public.purchase_orders
      where vendor_id = old.id
        and deleted_at is null
        and status in ('requested', 'pending', 'approved', 'ordered', 'partially_fulfilled');

    select count(*) into v_open_reqs
      from public.requisitions
      where vendor_id = old.id
        and deleted_at is null
        and status in ('draft', 'pending_approval', 'approved');

    if v_open_pos > 0 or v_open_reqs > 0 then
      raise exception 'Cannot delete vendor — it has % open purchase order(s) and % open requisition(s)',
        v_open_pos, v_open_reqs
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$function$;

-- Trigger function only; never callable as an RPC.
revoke all on function public.block_vendor_delete_with_open_records() from public, anon, authenticated;

drop trigger if exists trg_block_vendor_delete_with_open_records on public.vendors;
create trigger trg_block_vendor_delete_with_open_records
  before update of deleted_at on public.vendors
  for each row
  execute function public.block_vendor_delete_with_open_records();
