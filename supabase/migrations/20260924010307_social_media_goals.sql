-- Editable monthly goals for the Social Media dashboard (/dashboards/social-media).
-- One live row per org; when an org has none the app falls back to the
-- defaults below (the targets from Twins' original tracker spreadsheet).
-- Rates are fractions (0.03 = 3%). Posts are per week, all platforms combined;
-- the dashboard multiplies by the number of weeks in the month.
create table if not exists public.social_media_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org_id() references public.organizations(id),
  posts_per_week_min numeric not null default 2 check (posts_per_week_min >= 0),
  posts_per_week_max numeric not null default 3,
  engagement_rate_min numeric not null default 0.03 check (engagement_rate_min >= 0),
  engagement_rate_max numeric not null default 0.05,
  leads_min numeric not null default 3 check (leads_min >= 0),
  leads_max numeric not null default 5,
  follower_growth_min numeric not null default 0.05 check (follower_growth_min >= 0),
  follower_growth_max numeric not null default 0.10,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_media_goals_ranges check (
    posts_per_week_max >= posts_per_week_min
    and engagement_rate_max >= engagement_rate_min
    and leads_max >= leads_min
    and follower_growth_max >= follower_growth_min
  )
);

create unique index if not exists social_media_goals_org_live_uidx
  on public.social_media_goals (org_id)
  where deleted_at is null;

alter table public.social_media_goals enable row level security;

drop policy if exists "social_media_goals_org" on public.social_media_goals;
create policy "social_media_goals_org" on public.social_media_goals
  for all
  using (org_id = public.my_org_id())
  with check (org_id = public.my_org_id());

drop trigger if exists social_media_goals_set_updated_at on public.social_media_goals;
create trigger social_media_goals_set_updated_at
  before update on public.social_media_goals
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
