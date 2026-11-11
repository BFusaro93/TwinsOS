-- prevent_asset_hierarchy_cycle(): the parent-vehicle path
-- (prevent_asset_parent_vehicle_conflict) already refuses a parent vehicle
-- from another org or one that is deleted, but a parent ASSET was only checked
-- for cycles/depth — the FK alone let a row point parent_asset_id at another
-- org's asset (SECURITY DEFINER, so the lookups here ignore RLS) or at a
-- deleted asset. Same org + not deleted is now required when the link is set
-- or changed. Every existing check is kept as-is (latest definition:
-- 20260902170000_asset_hierarchy_integrity.sql).
create or replace function public.prevent_asset_hierarchy_cycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.parent_asset_id is null then
    return new;
  end if;

  if new.parent_asset_id = new.id then
    raise exception 'An asset cannot be its own parent';
  end if;

  -- New: the parent must be a live asset in the same org. Only checked when
  -- the link is created or changed, so editing other fields of an older row
  -- never fails on it.
  if (tg_op = 'INSERT' or new.parent_asset_id is distinct from old.parent_asset_id)
     and not exists (
       select 1 from public.assets
       where id = new.parent_asset_id and org_id = new.org_id and deleted_at is null
     ) then
    raise exception 'The selected parent asset does not exist';
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
$function$;
