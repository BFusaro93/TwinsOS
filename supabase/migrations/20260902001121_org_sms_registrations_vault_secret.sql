-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).

alter table org_sms_registrations
  add column if not exists twilio_api_key_sid text,
  add column if not exists twilio_api_secret_vault_id uuid references vault.secrets(id);

create or replace function get_org_twilio_api_secret(p_org_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select vault.decrypted_secrets.decrypted_secret
  from org_sms_registrations
  join vault.decrypted_secrets on vault.decrypted_secrets.id = org_sms_registrations.twilio_api_secret_vault_id
  where org_sms_registrations.org_id = p_org_id
$$;

revoke all on function get_org_twilio_api_secret(uuid) from public, anon, authenticated;
grant execute on function get_org_twilio_api_secret(uuid) to service_role;
