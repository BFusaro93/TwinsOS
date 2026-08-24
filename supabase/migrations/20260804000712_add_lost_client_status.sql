-- A lead closed as lost was previously stored as status = 'inactive', which
-- conflates "never became a client" with "was an active client, now paused".
-- Add a distinct 'lost' status so closed-lost leads are labeled correctly.
alter table clients drop constraint if exists clients_status_check;
alter table clients add constraint clients_status_check
  check (status in ('active', 'inactive', 'lead', 'cancelled', 'lost'));
