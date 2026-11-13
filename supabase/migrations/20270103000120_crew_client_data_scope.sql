-- Crew client data scope (round 13, security).
--
-- Crew logins could read every client's timeline (amounts, email subjects,
-- office notes), every contact and property in the org; rewrite timeline rows;
-- add notes to any client; change contact emails; insert/update clients; and
-- read/delete anything in the client-files bucket. The clients table already
-- limits crew SELECT to clients on the crew's own visits — the related tables
-- now follow the same rule:
--
--   client_activity   SELECT: crew-visible clients, or rows the crew wrote
--                     INSERT: crew-visible clients, created_by = auth.uid()
--                     UPDATE / DELETE: none
--   client_contacts,
--   client_properties SELECT: crew-visible clients; no writes
--   clients           no INSERT / UPDATE / DELETE by crew
--   storage client-files: CRM users of the org only, never crew
--
-- RESTRICTIVE policies keyed on my_role() = 'crew', so every other role keeps
-- exactly the access it had. Service role (crew API routes that write through
-- the service client) bypasses RLS as before.
--
-- PROD: apply AFTER the code deploy — the crew upsell route now sets
-- created_by on its timeline row; old code would have that insert refused
-- (best-effort, logged, suggestion still saved — so applying before is also
-- safe, it only drops that one timeline row until the deploy lands).

-- Same visibility rule as the clients policy "crew can read own assigned
-- clients": a live, assigned visit whose effective crew is one of mine.
-- SECURITY DEFINER so it is not filtered again by crm_job_visits RLS.
create or replace function public.crew_can_see_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_client_id is not null and exists (
    select 1
    from public.crm_job_visits v
    where v.client_id = p_client_id
      and v.org_id = public.my_org_id()
      and v.deleted_at is null
      and not v.crew_unassigned
      and coalesce(v.crew_id, public.crm_job_crew_id(v.job_id)) in (select public.my_crew_ids())
  );
$$;

revoke all on function public.crew_can_see_client(uuid) from public, anon;
grant execute on function public.crew_can_see_client(uuid) to authenticated, service_role;

-- ── client_activity ─────────────────────────────────────────────────────────
drop policy if exists crew_scope_client_activity_select on public.client_activity;
create policy crew_scope_client_activity_select on public.client_activity
  as restrictive for select
  using (
    (select public.my_role()) is distinct from 'crew'
    or created_by = (select auth.uid())
    or public.crew_can_see_client(client_id)
  );

drop policy if exists crew_scope_client_activity_insert on public.client_activity;
create policy crew_scope_client_activity_insert on public.client_activity
  as restrictive for insert
  with check (
    (select public.my_role()) is distinct from 'crew'
    or (created_by = (select auth.uid()) and public.crew_can_see_client(client_id))
  );

drop policy if exists crew_no_update_client_activity on public.client_activity;
create policy crew_no_update_client_activity on public.client_activity
  as restrictive for update
  using ((select public.my_role()) is distinct from 'crew')
  with check ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_delete_client_activity on public.client_activity;
create policy crew_no_delete_client_activity on public.client_activity
  as restrictive for delete
  using ((select public.my_role()) is distinct from 'crew');

-- ── client_contacts / client_properties ─────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['client_contacts', 'client_properties'] loop
    execute format('drop policy if exists crew_scope_%1$s_select on public.%1$I', t);
    execute format(
      'create policy crew_scope_%1$s_select on public.%1$I as restrictive for select
         using ((select public.my_role()) is distinct from ''crew'' or public.crew_can_see_client(client_id))', t);

    execute format('drop policy if exists crew_no_insert_%1$s on public.%1$I', t);
    execute format(
      'create policy crew_no_insert_%1$s on public.%1$I as restrictive for insert
         with check ((select public.my_role()) is distinct from ''crew'')', t);

    execute format('drop policy if exists crew_no_update_%1$s on public.%1$I', t);
    execute format(
      'create policy crew_no_update_%1$s on public.%1$I as restrictive for update
         using ((select public.my_role()) is distinct from ''crew'')
         with check ((select public.my_role()) is distinct from ''crew'')', t);

    execute format('drop policy if exists crew_no_delete_%1$s on public.%1$I', t);
    execute format(
      'create policy crew_no_delete_%1$s on public.%1$I as restrictive for delete
         using ((select public.my_role()) is distinct from ''crew'')', t);
  end loop;
end;
$$;

-- ── clients: crew never creates, edits or deletes a client ──────────────────
drop policy if exists crew_no_insert_clients on public.clients;
create policy crew_no_insert_clients on public.clients
  as restrictive for insert
  with check ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_update_clients on public.clients;
create policy crew_no_update_clients on public.clients
  as restrictive for update
  using ((select public.my_role()) is distinct from 'crew')
  with check ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_delete_clients on public.clients;
create policy crew_no_delete_clients on public.clients
  as restrictive for delete
  using ((select public.my_role()) is distinct from 'crew');

-- ── storage: client-files bucket ────────────────────────────────────────────
-- Was "path starts with my profile's org" only — any login in the org (crew,
-- Equipt-only users, deactivated CRM employees) could list, download and
-- delete client files. Now: the active org (my_org_id(), so staff
-- impersonation resolves), CRM access, and not crew. Path stays org-foldered.
drop policy if exists org_members_read_client_files on storage.objects;
create policy org_members_read_client_files on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = (select public.my_org_id())::text
    and (select public.has_crm_access())
    and (select public.my_role()) is distinct from 'crew'
  );

drop policy if exists org_members_upload_client_files on storage.objects;
create policy org_members_upload_client_files on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = (select public.my_org_id())::text
    and (select public.has_crm_access())
    and (select public.my_role()) is distinct from 'crew'
  );

drop policy if exists org_members_delete_client_files on storage.objects;
create policy org_members_delete_client_files on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = (select public.my_org_id())::text
    and (select public.has_crm_access())
    and (select public.my_role()) is distinct from 'crew'
  );
