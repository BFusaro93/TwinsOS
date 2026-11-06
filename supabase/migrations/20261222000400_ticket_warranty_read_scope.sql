-- Tickets and warranties were readable by every CRM seat, crew logins included:
-- has_crm_access() is true for profiles.role = 'crew', and the SELECT policies
-- checked only org + has_crm_access(). A crew login could read every complaint,
-- billing dispute and "terminate service" ticket in the org straight through
-- PostgREST; the tickets_view_modify / warranty_view keys were enforced in the UI only.
--
-- RESTRICTIVE SELECT policies so the database matches the UI:
--   tickets   — tickets_view_modify sees the org's tickets; anyone else sees only
--               tickets they created (crew upsell suggestions, a crew leader's
--               notes) or that are assigned to them. Portal customers keep their
--               own permissive policy (portal_visible_clients) and pass here.
--   warranties — warranty_view or warranty_manage.
-- Admins pass via has_settings_permission. Server routes, crons and automations
-- use the service role and are unaffected.

drop policy if exists "ticket_read_scope" on public.crm_tickets;
create policy "ticket_read_scope"
  on public.crm_tickets as restrictive for select
  using (
    public.is_client_portal_user()
    or public.has_settings_permission('tickets_view_modify')
    or created_by = auth.uid()
    or assigned_to_id in (
      select ce.id from public.crm_employees ce
       where ce.user_id = auth.uid() and ce.deleted_at is null
    )
  );

drop policy if exists "warranty_read_scope" on public.crm_warranties;
create policy "warranty_read_scope"
  on public.crm_warranties as restrictive for select
  using (
    public.has_settings_permission('warranty_view')
    or public.has_settings_permission('warranty_manage')
  );
