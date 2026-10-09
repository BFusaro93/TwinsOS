-- Sub-assets (plows, salters, etc.) could only be attached to another asset;
-- vehicles live in their own table, so they could not be a parent. Add a
-- nullable assets.parent_vehicle_id. An asset has at most ONE parent — either
-- another asset (parent_asset_id) or a vehicle (parent_vehicle_id) — and the
-- hierarchy stays one level deep, same rule as prevent_asset_hierarchy_cycle.
alter table public.assets
  add column if not exists parent_vehicle_id uuid references public.vehicles(id) on delete set null;

create index if not exists idx_assets_parent_vehicle_id
  on public.assets (parent_vehicle_id) where parent_vehicle_id is not null;

create or replace function public.prevent_asset_parent_vehicle_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_vehicle_id is not null then
    if new.parent_asset_id is not null then
      raise exception 'An asset can have either a parent asset or a parent vehicle, not both';
    end if;
    if not exists (
      select 1 from public.vehicles
      where id = new.parent_vehicle_id and org_id = new.org_id and deleted_at is null
    ) then
      raise exception 'The selected parent vehicle does not exist';
    end if;
    if exists (
      select 1 from public.assets
      where parent_asset_id = new.id and deleted_at is null
    ) then
      raise exception 'This asset already has sub-assets and cannot also be assigned a parent';
    end if;
  end if;

  -- An asset attached to a vehicle can't also be used as another asset's parent.
  if new.parent_asset_id is not null and exists (
    select 1 from public.assets
    where id = new.parent_asset_id and parent_vehicle_id is not null
  ) then
    raise exception 'The selected parent is attached to a vehicle — only one level of hierarchy is supported';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_asset_parent_vehicle_conflict on public.assets;
create trigger trg_prevent_asset_parent_vehicle_conflict
  before insert or update of parent_vehicle_id, parent_asset_id on public.assets
  for each row execute function public.prevent_asset_parent_vehicle_conflict();

-- Soft-deleting a vehicle clears the link on its sub-assets (same as the
-- asset-parent version in 20260902170000_asset_hierarchy_integrity.sql).
create or replace function public.clear_children_parent_on_vehicle_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.assets set parent_vehicle_id = null where parent_vehicle_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_children_parent_on_vehicle_delete on public.vehicles;
create trigger trg_clear_children_parent_on_vehicle_delete
  after update of deleted_at on public.vehicles
  for each row execute function public.clear_children_parent_on_vehicle_delete();
