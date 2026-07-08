-- crm_schedules (+ season columns) was written in 20260620000006/7 but never
-- deployed to production — the Settings > Schedules page has never worked
-- there. Deploy it now, plus a new week_of_month column so "monthly"
-- schedules can express true calendar-month recurrence ("1st Monday of each
-- month") instead of the previous fixed-interval approximation, which
-- drifted across weekdays because 30 days isn't a multiple of 7.

create table if not exists public.crm_schedules (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  name         text not null,
  frequency    text not null check (frequency in ('weekly','bi_weekly','every_3_weeks','every_4_weeks','monthly')),
  day_of_week  text not null check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  week_pattern text check (week_pattern in ('even','odd','any')),
  anchor_date  date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
alter table public.crm_schedules alter column org_id set default public.my_org_id();
alter table public.crm_schedules enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'crm_schedules' and policyname = 'org_members_crm_schedules') then
    create policy "org_members_crm_schedules" on public.crm_schedules
      for all using (org_id = public.my_org_id());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_schedules_updated_at') then
    create trigger trg_crm_schedules_updated_at
      before update on public.crm_schedules
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.crm_schedules
  add column if not exists season_start text,
  add column if not exists season_end   text;

alter table public.crm_schedules
  add column if not exists week_of_month text
    check (week_of_month in ('first','second','third','fourth','last'));
