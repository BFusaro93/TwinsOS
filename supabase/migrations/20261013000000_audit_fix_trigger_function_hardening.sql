-- Security-advisor cleanup for the trigger functions added by the audit-fix
-- migrations (20261002*..20261012*): pin search_path and revoke direct EXECUTE
-- (trigger functions fire without any caller grant).
alter function public.crm_job_visits_crew_unassigned_sync() set search_path to 'public';

revoke execute on function public.release_milestone_on_invoice_void() from public, anon, authenticated;
revoke execute on function public.crm_job_visits_crew_unassigned_sync() from public, anon, authenticated;
