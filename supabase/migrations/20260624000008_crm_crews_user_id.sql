-- Link a crew to its shared login account (role = 'crew' profile).
-- One crew → one Supabase auth user. The crew app queries by this to find
-- which visits to show when a crew account logs in.
alter table crm_crews
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists crm_crews_user_id_unique
  on crm_crews (user_id) where user_id is not null;
