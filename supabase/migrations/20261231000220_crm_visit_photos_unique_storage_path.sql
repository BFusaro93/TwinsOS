-- One crm_visit_photos row per stored object.
--
-- The photo upload route keys the storage path off the crew app's per-photo
-- client id so a retried upload overwrites the same object, and checks for an
-- existing row first. Two retries arriving together both passed that check and
-- both inserted, so the photo showed twice (and counted twice toward the
-- required Before / After photos). The route now treats a unique-violation as
-- "already saved" and returns the existing row.
--
-- crm_visit_photos has no deleted_at (rows are removed outright), so the index
-- is a plain unique index on storage_path.
--
-- Existing duplicates would make the index build fail. Rather than deleting
-- anything, the index is only created when there are none; otherwise a notice
-- names the count and the migration leaves the table as it was (rerun after the
-- duplicates are reviewed). TEST had 0 duplicates when this was written.

do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes
  from (
    select storage_path from public.crm_visit_photos
    group by storage_path having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise notice 'crm_visit_photos: % storage_path value(s) are duplicated; unique index NOT created. Review and rerun.', v_dupes;
    return;
  end if;

  create unique index if not exists crm_visit_photos_storage_path_key
    on public.crm_visit_photos (storage_path);
end $$;
