-- Per-org platform list for the Social Media dashboard, stored on the same
-- settings row as the goals. Ordered jsonb array of
--   { "name": text, "color": "#rrggbb", "hidden": bool }
-- Array order = column/legend order. null = the built-in default list
-- (Facebook, Instagram, TikTok, YouTube, LinkedIn). Hidden platforms keep
-- their data in social_media_weekly_stats; they're just left off the
-- dashboard until shown again.
alter table public.social_media_goals
  add column if not exists platforms jsonb;

alter table public.social_media_goals
  drop constraint if exists social_media_goals_platforms_is_array;
alter table public.social_media_goals
  add constraint social_media_goals_platforms_is_array
  check (platforms is null or jsonb_typeof(platforms) = 'array');

notify pgrst, 'reload schema';
