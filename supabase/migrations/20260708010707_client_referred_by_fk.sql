-- Referred By: keep the existing free-text field (covers non-client sources
-- like "Google" or "Yard Sign") but add an optional link to a real client
-- record when the referrer IS an existing client, so referrals are reportable.

alter table clients add column if not exists referred_by_client_id uuid references clients(id) on delete set null;

create index if not exists clients_referred_by_client_id_idx
  on clients (referred_by_client_id)
  where deleted_at is null;
