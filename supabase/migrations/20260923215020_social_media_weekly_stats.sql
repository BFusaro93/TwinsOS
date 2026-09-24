-- Social Media dashboard (/dashboards/social-media, all orgs) — built to
-- replace Twins Lawn Service's "Social Media Metrics Tracker" spreadsheet. One row per
-- (org, week, platform), entered by hand each week.
--
-- followers is the platform's follower COUNT at the end of the week. The
-- spreadsheet's equivalent column had been filled with week-ending dates, so
-- its "Current Followers" lookup returned the same date serial for every
-- platform. net_new_followers is kept alongside it for weeks where only the
-- change is known (the UI derives it from consecutive counts when it can).
--
-- RLS is the standard per-org policy like safety_weeks — rows are only ever
-- the caller's own org's.

create table if not exists public.social_media_weekly_stats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org_id() references public.organizations(id),
  week_start date not null,
  platform text not null check (char_length(platform) between 1 and 40),
  posts integer check (posts >= 0),
  views integer check (views >= 0),
  likes integer check (likes >= 0),
  comments integer check (comments >= 0),
  shares integer check (shares >= 0),
  saves integer check (saves >= 0),
  followers integer check (followers >= 0),
  net_new_followers integer,
  leads integer check (leads >= 0),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists social_media_weekly_stats_live_uidx
  on public.social_media_weekly_stats (org_id, week_start, platform)
  where deleted_at is null;

alter table public.social_media_weekly_stats enable row level security;

drop policy if exists "social_media_weekly_stats_org" on public.social_media_weekly_stats;
create policy "social_media_weekly_stats_org" on public.social_media_weekly_stats
  for all
  using (org_id = public.my_org_id())
  with check (org_id = public.my_org_id());

drop trigger if exists social_media_weekly_stats_set_updated_at on public.social_media_weekly_stats;
create trigger social_media_weekly_stats_set_updated_at
  before update on public.social_media_weekly_stats
  for each row execute function public.set_updated_at();
