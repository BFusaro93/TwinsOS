-- Who may write Social Media dashboard data (weekly stats, goals, platform
-- list). Previously any org member could write at the DB level — the
-- Admin/Manager check existed only in the UI. Now enforced here:
--   * profiles.role 'admin' or 'manager' (unchanged from before — several
--     managers have no CRM role, so a permission-only rule would have
--     silently removed their access), OR
--   * a CRM role with the new 'social_media_edit' key, so an org can give
--     e.g. a social media manager edit access without Admin/Manager.
-- Reads stay open to the whole org.
create or replace function public.can_edit_social_media()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select role in ('admin', 'manager') from public.profiles where id = auth.uid()), false)
      or public.has_settings_permission('social_media_edit');
$$;

revoke execute on function public.can_edit_social_media() from public, anon;
grant execute on function public.can_edit_social_media() to authenticated;

-- social_media_weekly_stats
drop policy if exists "social_media_weekly_stats_org" on public.social_media_weekly_stats;
drop policy if exists "social_media_weekly_stats_select" on public.social_media_weekly_stats;
drop policy if exists "social_media_weekly_stats_insert" on public.social_media_weekly_stats;
drop policy if exists "social_media_weekly_stats_update" on public.social_media_weekly_stats;
drop policy if exists "social_media_weekly_stats_delete" on public.social_media_weekly_stats;
create policy "social_media_weekly_stats_select" on public.social_media_weekly_stats
  for select using (org_id = public.my_org_id());
create policy "social_media_weekly_stats_insert" on public.social_media_weekly_stats
  for insert with check (org_id = public.my_org_id() and public.can_edit_social_media());
create policy "social_media_weekly_stats_update" on public.social_media_weekly_stats
  for update using (org_id = public.my_org_id() and public.can_edit_social_media())
  with check (org_id = public.my_org_id() and public.can_edit_social_media());
create policy "social_media_weekly_stats_delete" on public.social_media_weekly_stats
  for delete using (org_id = public.my_org_id() and public.can_edit_social_media());

-- social_media_goals (goals + platform list)
drop policy if exists "social_media_goals_org" on public.social_media_goals;
drop policy if exists "social_media_goals_select" on public.social_media_goals;
drop policy if exists "social_media_goals_insert" on public.social_media_goals;
drop policy if exists "social_media_goals_update" on public.social_media_goals;
drop policy if exists "social_media_goals_delete" on public.social_media_goals;
create policy "social_media_goals_select" on public.social_media_goals
  for select using (org_id = public.my_org_id());
create policy "social_media_goals_insert" on public.social_media_goals
  for insert with check (org_id = public.my_org_id() and public.can_edit_social_media());
create policy "social_media_goals_update" on public.social_media_goals
  for update using (org_id = public.my_org_id() and public.can_edit_social_media())
  with check (org_id = public.my_org_id() and public.can_edit_social_media());
create policy "social_media_goals_delete" on public.social_media_goals
  for delete using (org_id = public.my_org_id() and public.can_edit_social_media());
