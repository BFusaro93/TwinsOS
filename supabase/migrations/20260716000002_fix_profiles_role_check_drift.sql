-- Schema drift: prod's profiles_role_check already allowed 'crew' (added ad-hoc
-- at some point, no migration ever committed for it), but test's did not — any
-- attempt to create a crew-account profile against test failed with a check
-- constraint violation. Bring both in line with the same allowed value set.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role = any (array['admin','manager','technician','purchaser','viewer','requestor','crew']));
