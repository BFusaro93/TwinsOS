-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).

create or replace function create_secret_for_org_twilio_key(p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  v_id := vault.create_secret(p_secret);
  return v_id;
end;
$$;

revoke all on function create_secret_for_org_twilio_key(text) from public, anon, authenticated;
grant execute on function create_secret_for_org_twilio_key(text) to service_role;
