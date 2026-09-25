-- Profile views per platform per week (visits to the business's profile page,
-- as reported in each platform's insights). Tracked alongside views/reach;
-- deliberately NOT part of engagements (likes + comments + shares + saves).
alter table public.social_media_weekly_stats
  add column if not exists profile_views integer;

alter table public.social_media_weekly_stats
  drop constraint if exists social_media_weekly_stats_profile_views_check;
alter table public.social_media_weekly_stats
  add constraint social_media_weekly_stats_profile_views_check check (profile_views >= 0);

notify pgrst, 'reload schema';
