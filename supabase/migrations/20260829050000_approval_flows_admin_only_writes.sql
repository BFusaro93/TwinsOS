-- approval_flows/approval_flow_steps configure WHO gets to approve requisitions
-- and POs (required_role, assigned_user_id, threshold_cents). Their RLS was
-- `for all using (org_id = my_org_id())` with no role check at all, so any
-- authenticated org member — including viewer/technician/crew — could rewrite
-- the org's approval chain directly via the Supabase client (e.g. delete every
-- step, or reassign a step to themselves), even though the Settings UI only
-- exposes this to admins. Same class of bug as the crm_roles fix earlier
-- today (20260829040000) — split each single ALL policy into a read policy
-- open to the org and a write policy gated to admins.

drop policy if exists "org_members_approval_flows" on public.approval_flows;

create policy "org members can view approval flows" on public.approval_flows
  for select
  using (org_id = public.my_org_id());

create policy "admins can write approval flows" on public.approval_flows
  for insert
  with check (
    org_id = public.my_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

create policy "admins can update approval flows" on public.approval_flows
  for update
  using (
    org_id = public.my_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

create policy "admins can delete approval flows" on public.approval_flows
  for delete
  using (
    org_id = public.my_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

drop policy if exists "org_members_approval_flow_steps" on public.approval_flow_steps;

create policy "org members can view approval flow steps" on public.approval_flow_steps
  for select
  using (
    flow_id in (select id from public.approval_flows where org_id = public.my_org_id())
  );

create policy "admins can write approval flow steps" on public.approval_flow_steps
  for insert
  with check (
    flow_id in (select id from public.approval_flows where org_id = public.my_org_id())
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

create policy "admins can update approval flow steps" on public.approval_flow_steps
  for update
  using (
    flow_id in (select id from public.approval_flows where org_id = public.my_org_id())
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

create policy "admins can delete approval flow steps" on public.approval_flow_steps
  for delete
  using (
    flow_id in (select id from public.approval_flows where org_id = public.my_org_id())
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );
