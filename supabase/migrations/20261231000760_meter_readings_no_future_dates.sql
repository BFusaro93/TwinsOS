-- Meter readings can't be dated after today on the company's calendar
-- (org_timezone / org_today). A future-dated reading became the meter's
-- "latest" value, fired or blocked meter automations on a reading not yet
-- taken, and made every real reading before it look out of order. The Add
-- Reading dialog now caps the date and the shared reading path rejects it;
-- this is the enforcement for every writer (API, imports, console).
-- Checked on insert and when reading_at changes, so existing rows never block
-- an unrelated edit. Applies to all writers — Samsara stamps now(), which is
-- always today.
create or replace function public.meter_readings_reject_future_date()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.reading_at is not null
     and (tg_op = 'INSERT' or new.reading_at is distinct from old.reading_at)
     and (new.reading_at at time zone public.org_timezone(new.org_id))::date
         > public.org_today(new.org_id) then
    raise exception 'A reading can''t be dated in the future.' using errcode = '22007';
  end if;
  return new;
end;
$$;

revoke all on function public.meter_readings_reject_future_date() from public, anon, authenticated;

drop trigger if exists trg_meter_readings_reject_future_date on public.meter_readings;
create trigger trg_meter_readings_reject_future_date
  before insert or update of reading_at on public.meter_readings
  for each row execute function public.meter_readings_reject_future_date();
