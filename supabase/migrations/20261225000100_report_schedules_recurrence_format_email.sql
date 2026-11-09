-- report_schedules: Service Autopilot-style recurrence, attachment format, and
-- custom email content.
--
-- Until now a schedule meant "email this report as a PDF every day at
-- hour_local". This adds:
--   * frequency       once | daily | weekly | monthly
--   * weekdays        weekly: which days (0 = Sun .. 6 = Sat), every week
--   * monthly_mode    monthly: 'day_of_month' (month_day 1-31, clamped to the
--                     month's last day) or 'nth_weekday' (month_week 1-4 or
--                     -1 = last, month_weekday 0-6)
--   * start_date      first ORG-LOCAL date a run may happen (the run date for
--                     'once'); end_date = last org-local date a run may happen
--   * format          'pdf' | 'xlsx'
--   * email_subject / email_message  optional overrides; blank = default text
--
-- ADDITIVE + IDEMPOTENT. Every new column either defaults to the old behaviour
-- (frequency 'daily', format 'pdf', empty weekdays) or is nullable, so every
-- existing row keeps sending exactly as before: daily, PDF, default wording,
-- no start/end bound. The cron's "already ran today on the org's calendar"
-- claim (last_run_at) is unchanged, so nothing double-sends on deploy.
--
-- Cross-field rules (weekly needs >= 1 weekday, monthly needs its mode's
-- fields, once needs start_date) are enforced by CHECK constraints below AND
-- by the Zod schema in src/types/report-schedules.ts. Existing rows satisfy
-- them trivially (all 'daily').

alter table public.report_schedules
  add column if not exists frequency text not null default 'daily',
  add column if not exists weekdays smallint[] not null default '{}',
  add column if not exists monthly_mode text,
  add column if not exists month_day smallint,
  add column if not exists month_week smallint,
  add column if not exists month_weekday smallint,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists format text not null default 'pdf',
  add column if not exists email_subject text,
  add column if not exists email_message text;

-- Belt and braces for a re-run against a table where a previous partial apply
-- left NULLs (add column ... default backfills, but be explicit).
update public.report_schedules set frequency = 'daily' where frequency is null;
update public.report_schedules set format = 'pdf' where format is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'report_schedules_frequency_check') then
    alter table public.report_schedules
      add constraint report_schedules_frequency_check
      check (frequency in ('once', 'daily', 'weekly', 'monthly'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_format_check') then
    alter table public.report_schedules
      add constraint report_schedules_format_check
      check (format in ('pdf', 'xlsx'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_weekdays_check') then
    alter table public.report_schedules
      add constraint report_schedules_weekdays_check
      check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_monthly_mode_check') then
    alter table public.report_schedules
      add constraint report_schedules_monthly_mode_check
      check (monthly_mode is null or monthly_mode in ('day_of_month', 'nth_weekday'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_month_day_check') then
    alter table public.report_schedules
      add constraint report_schedules_month_day_check
      check (month_day is null or month_day between 1 and 31);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_month_week_check') then
    alter table public.report_schedules
      add constraint report_schedules_month_week_check
      check (month_week is null or month_week in (1, 2, 3, 4, -1));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_month_weekday_check') then
    alter table public.report_schedules
      add constraint report_schedules_month_weekday_check
      check (month_weekday is null or month_weekday between 0 and 6);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_date_range_check') then
    alter table public.report_schedules
      add constraint report_schedules_date_range_check
      check (start_date is null or end_date is null or end_date >= start_date);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_schedules_email_length_check') then
    alter table public.report_schedules
      add constraint report_schedules_email_length_check
      check (
        (email_subject is null or char_length(email_subject) <= 200)
        and (email_message is null or char_length(email_message) <= 5000)
      );
  end if;

  -- The recurrence is complete for its frequency. NOT VALID would skip the
  -- scan, but every existing row is 'daily' and passes, so validate normally.
  if not exists (select 1 from pg_constraint where conname = 'report_schedules_recurrence_complete_check') then
    alter table public.report_schedules
      add constraint report_schedules_recurrence_complete_check
      check (
        case frequency
          when 'once' then start_date is not null
          when 'weekly' then cardinality(weekdays) > 0
          when 'monthly' then
            (monthly_mode = 'day_of_month' and month_day is not null)
            or (monthly_mode = 'nth_weekday' and month_week is not null and month_weekday is not null)
          else true
        end
      );
  end if;
end $$;

comment on column public.report_schedules.hour_local is
  'Hour of day (0-23) on the OWNING ORG''s clock (organizations.timezone) the cron sends at.';
comment on column public.report_schedules.frequency is
  'once | daily | weekly | monthly. Next-run math: src/lib/reports/schedule-recurrence.ts.';
comment on column public.report_schedules.start_date is
  'First org-local date a run may happen; for frequency=once, the run date.';
comment on column public.report_schedules.end_date is
  'Last org-local date a run may happen (inclusive). NULL = no end.';
