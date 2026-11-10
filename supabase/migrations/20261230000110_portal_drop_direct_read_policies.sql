-- Portal customers lose their direct (PostgREST / Realtime) read path to
-- crm_invoices, crm_job_visits and clients.
--
-- "portal user reads own invoices", "portal user reads own visits" and
-- "portal user reads own client" granted ALL columns of ALL matching rows: a
-- portal login with the anon key could read draft and soft-deleted invoices,
-- deleted visits, qbo_sync_error, sales_rep_id, actual_labor_cost_cents,
-- notes_to_crew, job_comments, skip_reason, rate_cents, office_notes, etc. —
-- and Realtime pushed the same full rows. RLS can't filter columns, so the
-- portal now reads these tables only through server code (service client,
-- scoped by getPortalContext / getPortalAccounts, explicit column lists, drafts
-- and deleted rows excluded); visit status updates are polled from
-- /api/portal/visits/status instead of Realtime.
--
-- portal_visible_clients() stays (the crm_tickets portal policies use it) but
-- now also requires the login's own client to be live and the org to still
-- have the client-portal add-on, matching getPortalContext().
--
-- DEPLOY ORDER: apply AFTER the code that stops reading these tables with the
-- portal user's session is live — the previously deployed portal pages read
-- them through these policies and would show empty data until then.

drop policy if exists "portal user reads own invoices" on public.crm_invoices;
drop policy if exists "portal user reads own visits" on public.crm_job_visits;
drop policy if exists "portal user reads own client" on public.clients;

-- Mirrors orgHasAddon(db, orgId, "client_portal") in
-- src/lib/stripe/addon-access.ts + planIncludesAddon in src/lib/stripe/plans.ts:
-- canceled → no; non-billable plans (free, an unexpired trial) bundle
-- everything; growth/enterprise bundle client_portal; otherwise a purchased,
-- enabled add-on row with a Stripe subscription item is required.
create or replace function public.org_has_client_portal(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_org_id
      and coalesce(o.plan, '') <> 'canceled'
      and (
        (
          not (o.plan = 'trial' and o.trial_ends_at is not null and o.trial_ends_at <= now())
          and (
            coalesce(o.plan, '') not in ('cmms', 'starter', 'growth', 'enterprise')
            or o.plan in ('growth', 'enterprise')
          )
        )
        or exists (
          select 1
          from public.organization_addons a
          where a.org_id = o.id
            and a.addon_key = 'client_portal'
            and a.enabled = true
            and a.stripe_subscription_item_id is not null
        )
      )
  );
$$;

revoke all on function public.org_has_client_portal(uuid) from public, anon, authenticated;

create or replace function public.portal_visible_clients()
returns table(client_id uuid, org_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select cpu.client_id, cpu.org_id
  from public.client_portal_users cpu
  join public.clients self
    on self.id = cpu.client_id
   and self.org_id = cpu.org_id
   and self.deleted_at is null
  where cpu.user_id = auth.uid()
    and cpu.deleted_at is null
    and public.org_has_client_portal(cpu.org_id)
  union
  select c.id, c.org_id
  from public.client_portal_users cpu
  join public.clients self
    on self.id = cpu.client_id
   and self.org_id = cpu.org_id
   and self.deleted_at is null
  join public.clients c
    on c.parent_client_id = cpu.client_id
   and c.org_id = cpu.org_id
  where cpu.user_id = auth.uid()
    and cpu.deleted_at is null
    and c.deleted_at is null
    and public.org_has_client_portal(cpu.org_id)
$$;
