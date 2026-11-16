-- Report Center RPC: groundwork for enforcing its gates inside the database
-- (20270106000330 uses these). Additive only — safe BEFORE the deploy, and the
-- new server code tolerates this not being applied yet.
--
-- crm_run_report is callable by any signed-in user straight through the REST
-- API, so the permission / add-on / crew rules the app's report routes apply
-- must also hold in SQL. The app's own server routes, though, run prebuilt
-- reports, the KPI Scorecard and the Company Report through the same RPC after
-- applying their OWN gates (a role may hold a prebuilt report's key without the
-- raw-dataset key; the prebuilt catalog stays on every plan). Those server
-- calls identify themselves with a secret header, x-report-run-token, whose
-- value only the service role can read from report_run_trust. A call without it
-- is treated as an ad-hoc analysis and gets the full rules.
--
-- report_run_trust: one row, deny-all. No policies on purpose (RLS on, no
-- grants to anon/authenticated) — only the service role reads it.

create table if not exists public.report_run_trust (
  id smallint primary key default 1 check (id = 1),
  token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);

alter table public.report_run_trust enable row level security;
revoke all on table public.report_run_trust from public, anon, authenticated;
grant select on table public.report_run_trust to service_role;

insert into public.report_run_trust (id) values (1) on conflict (id) do nothing;

-- True when this request came from the app server's report code: either the
-- REST request carries the current x-report-run-token, or a service-role-only
-- wrapper set app.report_run_trusted for the transaction.
create or replace function public._report_run_trusted()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_header text;
begin
  if coalesce(current_setting('app.report_run_trusted', true), '') = 'on' then
    return true;
  end if;
  begin
    v_header := nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-report-run-token', '');
  exception when others then
    v_header := null;
  end;
  if v_header is null then
    return false;
  end if;
  return exists (select 1 from public.report_run_trust t where t.id = 1 and t.token = v_header);
end;
$$;

revoke all on function public._report_run_trusted() from public, anon;
grant execute on function public._report_run_trusted() to authenticated, service_role;

-- Mirrors orgHasAddon(db, orgId, "advanced_reporting") in
-- src/lib/stripe/addon-access.ts + planIncludesAddon in src/lib/stripe/plans.ts:
-- canceled → no; non-billable plans (free, an unexpired trial) bundle
-- everything; only enterprise bundles advanced_reporting; otherwise a
-- purchased, enabled add-on row with a Stripe subscription item is required.
create or replace function public.org_has_advanced_reporting(p_org_id uuid)
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
            or o.plan = 'enterprise'
          )
        )
        or exists (
          select 1
          from public.organization_addons a
          where a.org_id = o.id
            and a.addon_key = 'advanced_reporting'
            and a.enabled = true
            and a.stripe_subscription_item_id is not null
        )
      )
  );
$$;

revoke all on function public.org_has_advanced_reporting(uuid) from public, anon, authenticated;
grant execute on function public.org_has_advanced_reporting(uuid) to service_role;

-- The caller's own org only (crm_run_report runs as the caller).
create or replace function public.my_org_has_advanced_reporting()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select public.my_org_id()) is not null
     and public.org_has_advanced_reporting((select public.my_org_id()));
$$;

revoke all on function public.my_org_has_advanced_reporting() from public, anon;
grant execute on function public.my_org_has_advanced_reporting() to authenticated, service_role;
