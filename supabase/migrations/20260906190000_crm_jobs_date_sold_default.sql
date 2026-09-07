-- crm_jobs.date_sold is what the "Sales by Date Sold (Detail)" and "Approved
-- Sales by Sales Rep" reports (rpt_jobs.date_sold) filter on, but only the
-- New Job dialog ever wrote it — and it always sent null. Jobs converted from
-- estimates, package/recurring/snow/project/waiting-list jobs, the public API
-- and the Zapier action all left it null, so those reports returned no rows
-- for any date range (E-09).
--
-- App code now populates date_sold on every creation path. This trigger is
-- the backstop: any insert that omits it gets the current calendar date in
-- America/New_York (the org operating timezone hardcoded across the app —
-- see src/lib/reports/ny-date.ts).

create or replace function public.crm_jobs_default_date_sold()
returns trigger
language plpgsql
as $$
begin
  if new.date_sold is null then
    new.date_sold := (now() at time zone 'America/New_York')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_jobs_default_date_sold on public.crm_jobs;
create trigger trg_crm_jobs_default_date_sold
  before insert on public.crm_jobs
  for each row
  execute function public.crm_jobs_default_date_sold();

-- One-time backfill ACROSS ALL ORGS: date_sold = the job's creation date in
-- America/New_York. This is intentionally not scoped to one org — the column
-- is null on effectively every existing row in every org (nothing populated
-- it), so there is no real data to clobber; the creation date is the best
-- available proxy for the sale date and makes historical jobs appear in the
-- Date Sold reports instead of silently vanishing from them.
update public.crm_jobs
   set date_sold = (created_at at time zone 'America/New_York')::date
 where date_sold is null;
