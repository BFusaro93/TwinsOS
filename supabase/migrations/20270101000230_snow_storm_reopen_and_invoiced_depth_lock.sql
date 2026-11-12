-- Snow: (1) a Complete storm goes back to Working when a visit is added to it,
-- and (2) an invoiced visit's snow depth is locked like its status and date.
--
-- 1. The dispatch board hid nothing on a Complete storm, so Add Jobs / Add push
--    created new, un-worked visits on a storm everyone reads as finished. The
--    board now hides both on a Complete storm, and any visit inserted onto (or
--    moved onto) a Complete storm puts the storm back to Working, whichever
--    path added it. SECURITY DEFINER: crew logins can't touch storms at all
--    (20270101000010), and the writer may be a scheduler whose update the
--    storm's own policies would otherwise judge.
--
-- 2. Per-inch / per-push snow bills from snow_depth_inches. Once the visit is on
--    a live (non-void) invoice, changing the depth no longer matched the bill.
--    crm_job_visits_guard_invoiced now also refuses a depth change on an
--    invoiced completed visit (same override GUC). Body is the live definition
--    plus the depth clause; the trigger's column list gains snow_depth_inches.

create or replace function public.crm_storm_event_reopen_on_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.storm_event_id is not null and new.deleted_at is null
     and (tg_op = 'INSERT' or new.storm_event_id is distinct from old.storm_event_id) then
    update public.crm_storm_events
       set dispatch_status = 'working'
     where id = new.storm_event_id
       and org_id = new.org_id
       and dispatch_status = 'complete';
  end if;
  return null;
end;
$$;

revoke all on function public.crm_storm_event_reopen_on_visit() from public, anon, authenticated;

drop trigger if exists trg_crm_job_visits_reopen_storm on public.crm_job_visits;
create trigger trg_crm_job_visits_reopen_storm
  after insert or update of storm_event_id on public.crm_job_visits
  for each row execute function public.crm_storm_event_reopen_on_visit();

create or replace function public.crm_job_visits_guard_invoiced()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status = 'completed'
     and (new.status is distinct from old.status
          or new.scheduled_date is distinct from old.scheduled_date
          or new.snow_depth_inches is distinct from old.snow_depth_inches
          or (old.deleted_at is null and new.deleted_at is not null))
     and coalesce(current_setting('app.invoiced_visit_override', true), '') <> 'on'
     and exists (
       select 1
       from public.crm_invoice_line_items li
       join public.crm_invoices i on i.id = li.invoice_id
       where li.visit_id = old.id
         and i.deleted_at is null
         and i.status <> 'void'
     )
  then
    raise exception 'This visit is completed and already invoiced — void or edit the invoice first, or ask an admin to override.'
      using errcode = 'P0001', hint = 'invoiced_visit_locked';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_crm_job_visits_guard_invoiced on public.crm_job_visits;
create trigger trg_crm_job_visits_guard_invoiced
  before update of status, scheduled_date, deleted_at, snow_depth_inches on public.crm_job_visits
  for each row execute function public.crm_job_visits_guard_invoiced();
