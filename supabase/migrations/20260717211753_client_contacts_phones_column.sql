-- client_contacts.phones was never added when clients.phones was (20260623000002).
-- useUpdateClientContact/useAddClientContact write a "phones" field on every save,
-- which Postgrest rejects with a missing-column error ("Failed to update contact").
alter table client_contacts
  add column if not exists phones jsonb not null default '[]'::jsonb;
