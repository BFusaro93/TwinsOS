-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).

grant execute on function public.my_org_id()                              to anon;
grant execute on function public.my_role()                                to anon;
grant execute on function public.my_crew_ids()                            to anon;
grant execute on function public.has_crm_access()                         to anon;
grant execute on function public.has_settings_permission(p_key text)      to anon;
grant execute on function public.is_staff(uid uuid)                       to anon;
