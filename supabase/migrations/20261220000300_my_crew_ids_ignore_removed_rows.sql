-- my_crew_ids() drives crew RLS (crm_job_visits, clients, job products, ...).
-- Its employee branch ignored soft deletes: a person removed from a crew
-- (crm_crew_members.deleted_at set), or a soft-deleted employee, still got
-- that crew's visits and clients through RLS, and the branch wasn't scoped to
-- the caller's org. The crew-login branch likewise matched a soft-deleted
-- crew, which fetchCallerCrew() (the route-level lookup) already refuses.
-- Deactivated (is_active = false) crews keep working, as before; only
-- removed rows stop granting access.
create or replace function public.my_crew_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id
  from public.crm_crews c
  where c.user_id = auth.uid()
    and c.org_id = public.my_org_id()
    and c.deleted_at is null
  union
  select cm.crew_id
  from public.crm_crew_members cm
  join public.crm_employees e on e.id = cm.employee_id
  where e.user_id = auth.uid()
    and e.is_active = true
    and e.deleted_at is null
    and cm.deleted_at is null
    and cm.org_id = public.my_org_id();
$$;
