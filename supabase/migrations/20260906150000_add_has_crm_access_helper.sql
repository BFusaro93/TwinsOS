-- Mirrors the client-side useCrmAccess gate (src/lib/hooks/use-permissions.ts)
-- at the RLS layer: admins always pass; crew accounts pass without needing a
-- crm_employees/crm_roles link (none of them have one today -- crew access is
-- governed by its own narrower per-table policies elsewhere, not this check);
-- everyone else must have a live crm_employees row linked to a non-deleted
-- crm_roles record. Purely additive here -- no existing policy references
-- this yet; policies are updated to use it in the migration that follows.
create or replace function public.has_crm_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select role from public.profiles where id = auth.uid()) in ('admin', 'crew')
    or exists (
      select 1
      from public.crm_employees ce
      join public.crm_roles cr on cr.id = ce.crm_role_id
      where ce.user_id = auth.uid()
        and ce.deleted_at is null
        and cr.deleted_at is null
    );
$$;

comment on function public.has_crm_access() is
  'RLS helper: does the calling user have Landscapt/CRM access -- admin, crew, or a live crm_employees->crm_roles link? Mirrors useCrmAccess() in the app.';
