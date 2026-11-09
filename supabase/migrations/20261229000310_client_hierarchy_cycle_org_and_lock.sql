-- prevent_client_hierarchy_cycle: two gaps in the parent/sub-account guard.
--
-- 1. It never checked the parent's org. The trigger is SECURITY DEFINER, so its
--    lookups ignore RLS: a parent_client_id from another org was read, passed the
--    one-level checks and was stored (a cross-org parent link).
-- 2. No lock: A→B and B→A saved at the same moment both saw "parent has no
--    parent" and committed a two-account cycle. The parent row is now read FOR
--    UPDATE, so the second save waits for the first and then sees its result
--    (one of them fails cleanly, or Postgres aborts one as a deadlock).
--
-- Every existing check is kept as it was.

create or replace function public.prevent_client_hierarchy_cycle()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_parent_org uuid;
  v_parent_parent uuid;
begin
  if new.parent_client_id is null then
    return new;
  end if;

  if new.parent_client_id = new.id then
    raise exception 'A client cannot be its own parent';
  end if;

  select org_id, parent_client_id
    into v_parent_org, v_parent_parent
    from public.clients
   where id = new.parent_client_id
   for update;

  if not found or v_parent_org is distinct from new.org_id then
    raise exception 'The selected parent account was not found in this organization'
      using errcode = '23503';
  end if;

  if v_parent_parent is not null then
    raise exception 'The selected parent already has a parent of its own — only one level of hierarchy is supported';
  end if;

  if exists (
    select 1 from public.clients
    where parent_client_id = new.id and deleted_at is null
  ) then
    raise exception 'This client already has sub-accounts and cannot also be assigned a parent';
  end if;

  return new;
end;
$function$;
