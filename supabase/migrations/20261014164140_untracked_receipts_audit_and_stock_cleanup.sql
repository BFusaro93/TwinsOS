-- Receiving ignored product_items.is_inventory ("Track inventory"), so
-- untracked products silently accumulated quantity_on_hand and cost layers
-- (the Products page hides the number for untracked items). Receiving now
-- skips stock for untracked non-maintenance products and for lines assigned
-- to a project; this migration:
--   1. adds log_receipt_without_stock(), which writes the audit rows that show
--      where such a receipt went (one on the product, one on the project);
--   2. snapshots, then zeroes, the leftover stock on untracked
--      project_material / stocked_material products.
-- maintenance_part products are left alone: their stock is mirrored on the
-- parts table and has its own invariants.

-- 1. Audit helper ------------------------------------------------------------

create or replace function public.log_receipt_without_stock(
  p_org_id     uuid,
  p_product_id uuid,
  p_project_id uuid,
  p_po_number  text,
  p_quantity   numeric,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id      uuid := auth.uid();
  v_user_name    text;
  v_product_name text;
  v_project_name text;
  v_po           text := coalesce(nullif(p_po_number, ''), '(unknown)');
begin
  if v_user_id is null or public._equipt_org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  select name into v_product_name
    from public.product_items
    where id = p_product_id and org_id = p_org_id and deleted_at is null;
  if v_product_name is null then
    raise exception 'Product not found';
  end if;

  if p_project_id is not null then
    select name into v_project_name
      from public.projects
      where id = p_project_id and org_id = p_org_id and deleted_at is null;
  end if;

  select name into v_user_name from public.profiles where id = v_user_id limit 1;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action, changed_by_name, description
  ) values (
    p_org_id, v_user_id, 'product', p_product_id, 'received',
    coalesce(v_user_name, 'System'),
    v_product_name || ': ' || p_quantity || ' received via PO ' || v_po
      || case when v_project_name is not null
              then ' for project "' || v_project_name || '"' else '' end
      || ', not added to stock ('
      || case when p_reason = 'untracked'
              then 'Track inventory is off'
              else 'assigned to a project' end
      || ')'
  );

  if v_project_name is not null then
    insert into public.audit_log (
      org_id, created_by, record_type, record_id, action, changed_by_name, description
    ) values (
      p_org_id, v_user_id, 'project', p_project_id, 'received',
      coalesce(v_user_name, 'System'),
      p_quantity || ' × ' || v_product_name || ' received via PO ' || v_po
        || ' and used directly on this project (not added to inventory)'
    );
  end if;
end;
$function$;

revoke all on function public.log_receipt_without_stock(uuid, uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.log_receipt_without_stock(uuid, uuid, uuid, text, numeric, text) to authenticated;

-- 2. Snapshot + zero leftover stock on untracked products --------------------

create table if not exists public.product_untracked_stock_cleanup (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  product_id       uuid not null,
  quantity_on_hand numeric not null,
  cost_layers      jsonb,
  unit_cost        integer,
  created_at       timestamptz not null default now()
);

-- Deny-all on purpose: a one-time safety snapshot read with the service role
-- (restore = copy quantity_on_hand / cost_layers back onto product_items).
alter table public.product_untracked_stock_cleanup enable row level security;

insert into public.product_untracked_stock_cleanup
  (org_id, product_id, quantity_on_hand, cost_layers, unit_cost)
select org_id, id, quantity_on_hand, cost_layers, unit_cost
  from public.product_items
  where deleted_at is null
    and coalesce(is_inventory, false) = false
    and category <> 'maintenance_part'
    and coalesce(quantity_on_hand, 0) <> 0;

update public.product_items
  set quantity_on_hand = 0,
      cost_layers = '[]'::jsonb
  where deleted_at is null
    and coalesce(is_inventory, false) = false
    and category <> 'maintenance_part'
    and coalesce(quantity_on_hand, 0) <> 0;
