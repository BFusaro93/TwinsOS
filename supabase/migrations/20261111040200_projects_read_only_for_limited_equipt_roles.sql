-- Projects are read-only for the limited Equipt roles (viewer, requestor).
--
-- 20260929140000 scoped role_write_guard_* to the Equipt tables and left
-- `projects` off the list, so a viewer or requestor could still create, edit
-- and delete projects (and rewrite contract_price) through the API even
-- though the rest of Equipt is read-only for them. `projects` is shared with
-- Landscapt, whose access follows crm_roles, so this gates ONLY on
-- profiles.role in ('viewer','requestor'). Purchasers keep write access
-- (they need it for project cost tracking); every other role is unchanged.
-- Same restrictive-policy shape as the other Equipt tables. SECURITY DEFINER
-- trigger/RPC writes (change orders, milestone billing) are unaffected.

drop policy if exists role_write_guard_ins on public.projects;
drop policy if exists role_write_guard_upd on public.projects;
drop policy if exists role_write_guard_del on public.projects;

create policy role_write_guard_ins on public.projects
  as restrictive for insert
  with check (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']));

create policy role_write_guard_upd on public.projects
  as restrictive for update
  using (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']))
  with check (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']));

create policy role_write_guard_del on public.projects
  as restrictive for delete
  using (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']));
