-- Crew logins (profiles.role = 'crew') get a Dashboards tile on their home
-- page but have no Report Center permission, so every custom dashboard was
-- hidden from them. Let admins opt individual dashboards in for crew — e.g.
-- a "Crew Scoreboard" — without exposing the whole Report Center.
--
-- Server-side enforcement lives in src/lib/reports/crew-dashboard-access.ts:
-- crew may list/open only dashboards with visible_to_crew = true, and may run
-- only the prebuilt reports / datasets those dashboards' panels reference.
alter table public.crm_dashboards
  add column if not exists visible_to_crew boolean not null default false;

comment on column public.crm_dashboards.visible_to_crew is
  'When true, crew-role logins can open this dashboard (and run its panels) without Report Center permission.';
