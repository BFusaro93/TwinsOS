-- Bug sweep round 15 (area 1): stored storage paths must live in the row's own org folder.
--
-- WHAT / WHY
--   The `attachments` bucket's storage.objects policies `org_members_read_attachments`
--   and `org_members_delete_attachments` grant access to an object when an
--   `public.attachments` row with storage_path = objects.name belongs to the caller's
--   org. Nothing tied attachments.storage_path to that org, so a tenant could insert a
--   row pointing at ANOTHER org's object path (paths leak through signed URLs on public
--   proposals / invoices / the portal) and then read or delete that file.
--
--   1. attachments: BEFORE INSERT OR UPDATE OF storage_path, org_id trigger — a new or
--      changed storage_path must start with `<org_id>/`. Existing legacy rows (PROD has
--      179 paths led by po/, work_order/, vehicle/, project/, asset/, vendor/,
--      damage_case/) are untouched and keep working: an UPDATE that changes neither
--      storage_path nor org_id (rename, soft delete, …) passes.
--   2. crm_visit_photos.storage_path and every element of crm_ticket_messages.photo_paths
--      are signed with the SERVICE client by the office/portal routes, so a forged row
--      would hand out another org's file. Both have 0 violators on PROD → CHECK constraints.
--   3. The bucket's own storage.objects policies (upload / read / delete) resolved the org
--      from profiles.org_id, while attachments.org_id defaults to my_org_id(). For staff
--      impersonating an org those differ, so with (1) an impersonated upload would land in
--      the staff member's own folder and its row would then be rejected. All three now use
--      my_org_id() (same value as profiles.org_id for everyone else; also excludes inactive
--      logins, as my_org_id() does), and the uploaders (use-attachments.ts,
--      VehicleBulkImportDialog.tsx) build the folder from the my_org_id() RPC.
--
-- PROD: apply BEFORE OR AFTER the code deploy (all app uploaders already write
--   `<org_id>/...`; the estimate→job copy in use-crm-jobs.ts wrote `job/...` but that
--   copy was already rejected by the bucket's INSERT policy, so nothing that works today
--   breaks). PRE-CHECK on PROD (both must return 0):
--     select count(*) from crm_visit_photos where not starts_with(storage_path, org_id::text || '/');
--     select count(*) from crm_ticket_messages m
--      where exists (select 1 from unnest(m.photo_paths) p where not starts_with(p, m.org_id::text || '/'));

-- ── 1. attachments ────────────────────────────────────────────────────────────
create or replace function public.trg_attachments_storage_path_org_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.storage_path is not distinct from old.storage_path
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;

  if new.org_id is null
     or new.storage_path is null
     or not starts_with(new.storage_path, new.org_id::text || '/') then
    raise exception 'attachment storage_path must be inside the organization''s own folder'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.trg_attachments_storage_path_org_guard() from public, anon, authenticated;

drop trigger if exists trg_attachments_storage_path_org_guard on public.attachments;
-- Named to sort after trg_attachments_created_by; org_id is filled by its column
-- DEFAULT (my_org_id()) before any BEFORE trigger runs.
create trigger trg_attachments_storage_path_org_guard
  before insert or update of storage_path, org_id on public.attachments
  for each row execute function public.trg_attachments_storage_path_org_guard();

-- ── 2. crm_visit_photos / crm_ticket_messages ────────────────────────────────
create or replace function public.storage_paths_in_org(p_paths text[], p_org uuid)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_org is not null
     and coalesce(bool_and(p is not null and starts_with(p, p_org::text || '/')), true)
  from unnest(coalesce(p_paths, '{}'::text[])) as p;
$$;

grant execute on function public.storage_paths_in_org(text[], uuid) to authenticated, service_role;

alter table public.crm_visit_photos drop constraint if exists crm_visit_photos_storage_path_in_org;
alter table public.crm_visit_photos
  add constraint crm_visit_photos_storage_path_in_org
  check (public.storage_paths_in_org(array[storage_path], org_id)) not valid;
alter table public.crm_visit_photos validate constraint crm_visit_photos_storage_path_in_org;

alter table public.crm_ticket_messages drop constraint if exists crm_ticket_messages_photo_paths_in_org;
alter table public.crm_ticket_messages
  add constraint crm_ticket_messages_photo_paths_in_org
  check (public.storage_paths_in_org(photo_paths, org_id)) not valid;
alter table public.crm_ticket_messages validate constraint crm_ticket_messages_photo_paths_in_org;

-- ── 3. attachments bucket policies: my_org_id() instead of profiles.org_id ─────
drop policy if exists org_members_upload_attachments on storage.objects;
create policy org_members_upload_attachments on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select public.my_org_id())::text
  );

drop policy if exists org_members_read_attachments on storage.objects;
create policy org_members_read_attachments on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
        from public.attachments a
       where a.storage_path = objects.name
         and a.org_id = (select public.my_org_id())
    )
  );

drop policy if exists org_members_delete_attachments on storage.objects;
create policy org_members_delete_attachments on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
        from public.attachments a
       where a.storage_path = objects.name
         and a.org_id = (select public.my_org_id())
    )
  );
