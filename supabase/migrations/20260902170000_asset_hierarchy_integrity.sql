-- assets.parent_asset_id had no validation beyond the UI's dropdown
-- filtering (NewAssetDialog's "Parent Asset" picker only offers top-level
-- assets, and AssetDetailPanel's SubAssetsTab "Link Existing" enforces the
-- same one-level-deep model) — that filter runs against a possibly-stale
-- cache and isn't re-checked server-side, and useUpdateAsset writes the
-- column with no validation at all. Anyone issuing the same Supabase update
-- directly (devtools, a future code path, or two people concurrently
-- linking A->B and B->A) could set an asset as its own parent or create a
-- deeper/cyclical hierarchy than the UI assumes. The UI only ever supports
-- one hierarchy level (a parent can't itself have a parent), so enforce
-- that same rule at the DB layer — it also rules out any cycle, since a
-- node can never be both a parent (have children) and a child (have a
-- parent) at once. Mirrors 20260825010000_client_hierarchy_integrity.sql's
-- prevent_client_hierarchy_cycle trigger for the analogous Client
-- parent/child hierarchy.
create or replace function public.prevent_asset_hierarchy_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_asset_id is null then
    return new;
  end if;

  if new.parent_asset_id = new.id then
    raise exception 'An asset cannot be its own parent';
  end if;

  if exists (
    select 1 from public.assets
    where id = new.parent_asset_id and parent_asset_id is not null
  ) then
    raise exception 'The selected parent already has a parent of its own — only one level of hierarchy is supported';
  end if;

  if exists (
    select 1 from public.assets
    where parent_asset_id = new.id and deleted_at is null
  ) then
    raise exception 'This asset already has sub-assets and cannot also be assigned a parent';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_asset_hierarchy_cycle on public.assets;
create trigger trg_prevent_asset_hierarchy_cycle
  before insert or update of parent_asset_id on public.assets
  for each row execute function public.prevent_asset_hierarchy_cycle();

-- Soft-deleting a parent asset left children pointing at a dangling
-- parent_asset_id — the child's page could never resolve the parent's name
-- and its "Change"/click-through link 404'd. Clear the link on every child
-- when a parent is soft-deleted, same as a real delete would via
-- ON DELETE SET NULL.
create or replace function public.clear_children_parent_on_asset_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.assets
      set parent_asset_id = null
      where parent_asset_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_children_parent_on_asset_delete on public.assets;
create trigger trg_clear_children_parent_on_asset_delete
  after update of deleted_at on public.assets
  for each row execute function public.clear_children_parent_on_asset_delete();
