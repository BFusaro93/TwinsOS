-- clients.parent_client_id had no validation beyond the UI's dropdown
-- filtering (LinkParentDialog only offers clients with no parent of their
-- own) — that filter runs against a possibly-stale cache and isn't
-- re-checked server-side, and useSetParentClient writes the column with no
-- validation at all. Anyone issuing the same Supabase update directly
-- (devtools, a future code path, or two people concurrently linking A->B
-- and B->A) could set a client as its own parent or create a two-node
-- cycle. The UI also only ever supports one hierarchy level (a parent
-- can't itself have a parent), so enforce that same rule at the DB layer —
-- it also rules out any cycle, since a node can never be both a parent
-- (have children) and a child (have a parent) at once.
create or replace function public.prevent_client_hierarchy_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_client_id is null then
    return new;
  end if;

  if new.parent_client_id = new.id then
    raise exception 'A client cannot be its own parent';
  end if;

  if exists (
    select 1 from public.clients
    where id = new.parent_client_id and parent_client_id is not null
  ) then
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
$$;

drop trigger if exists trg_prevent_client_hierarchy_cycle on public.clients;
create trigger trg_prevent_client_hierarchy_cycle
  before insert or update of parent_client_id on public.clients
  for each row execute function public.prevent_client_hierarchy_cycle();

-- Soft-deleting a parent client (useDeleteClient only sets deleted_at, so
-- the FK's default ON DELETE behavior never fires) left children pointing
-- at a dangling parent_client_id — the child's page could never resolve
-- the parent's name and its "Change"/click-through link 404'd. Clear the
-- link on every child when a parent is soft-deleted, same as a real
-- delete would via ON DELETE SET NULL.
create or replace function public.clear_children_parent_on_client_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.clients
      set parent_client_id = null
      where parent_client_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_children_parent_on_client_delete on public.clients;
create trigger trg_clear_children_parent_on_client_delete
  after update of deleted_at on public.clients
  for each row execute function public.clear_children_parent_on_client_delete();
