-- Repair: in-app maintenance requests were credited to the wrong person.
-- NewRequestDialog stamped requested_by_name with the FIRST name in the org's
-- user list (profiles ordered by name) instead of the signed-in user, while
-- requested_by_id was correct. Reset the name from the requester's profile.
--
-- Narrowed so legitimate differences survive:
--   * requested_by_id set and that profile has a non-blank name that differs;
--   * the stored name is ANOTHER profile's name in the same org (the wrong
--     credit always came from the org's user list);
--   * not a crew login: the field repair-request page (per-crew logins) lets
--     the person type their own name, which is kept.
-- Idempotent: a re-run matches nothing.
update public.maintenance_requests mr
   set requested_by_name = p.name
  from public.profiles p
 where p.id = mr.requested_by_id
   and coalesce(btrim(p.name), '') <> ''
   and mr.requested_by_name is distinct from p.name
   and coalesce(p.role, '') <> 'crew'
   and exists (
     select 1 from public.profiles other
      where other.org_id = mr.org_id
        and other.id <> mr.requested_by_id
        and other.name = mr.requested_by_name
   );
