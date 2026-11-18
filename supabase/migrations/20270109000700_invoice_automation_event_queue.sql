-- Bug sweep round 15b (automations, area B): invoice_created = "invoice issued",
-- invoice_sent on Print / Mark as Sent — each exactly once per invoice.
--
-- WHAT / WHY
--   * invoice_created fired from the browser when the New Invoice sheet OPENED (an
--     empty $0 draft with no number, again on every reopen) and never fired for
--     auto-invoices (visit completion, contract cron, snow, milestones, consolidate,
--     duplicate-void). Owner decision: it means "invoice issued" — it fires once,
--     when the invoice first gets its number, on every path.
--   * invoice_sent fired only from the email route (on every resend). Owner
--     decision: it also fires on Print and Mark as Sent (the first move out of
--     draft into sent/printed), once per invoice.
--   One server-side place: an AFTER trigger on crm_invoices queues the event in
--   crm_automation_trigger_queue (now carrying invoice_id), and the existing
--   /api/automations/run drain enrolls it through the normal fireSimpleTrigger
--   code. A unique index on (trigger_type, invoice_id) makes it once per invoice.
--   Interactive paths (Save, Send, Print, email) claim the queued row through
--   claim_invoice_automation_event() and fire at once instead of waiting for the
--   next cron run; a claimed row is never fired again by the drain.
--   CSV imports number historical invoices through the new
--   assign_invoice_number(uuid, boolean) overload, which suppresses the event.
--   Existing invoices that already have an invoice_created / invoice_sent
--   enrollment are seeded as processed, so they never fire a second time.
--
-- PROD: apply BEFORE the code deploy (the new code calls
--   claim_invoice_automation_event and the 2-arg assign_invoice_number; the old
--   code keeps working against this schema — its own fires are just deduped by
--   enrollment scope until the deploy lands).
--   PRE-CHECK (expect 0 rows; the unique index can't be built otherwise — the
--   column is new, so this only matters if a previous attempt left rows):
--     select trigger_type, invoice_id, count(*) from crm_automation_trigger_queue
--      where invoice_id is not null group by 1,2 having count(*) > 1;

alter table public.crm_automation_trigger_queue
  add column if not exists invoice_id uuid references public.crm_invoices(id);

create unique index if not exists crm_automation_trigger_queue_invoice_event_uidx
  on public.crm_automation_trigger_queue (trigger_type, invoice_id)
  where invoice_id is not null;

-- ── queue writer (trigger) ────────────────────────────────────────────────────
create or replace function public.trg_crm_invoices_queue_automation_events()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.deleted_at is not null or new.status = 'void' or new.client_id is null then
    return null;
  end if;

  -- invoice_created: the invoice was issued (first got its number). Imports of
  -- historical invoices set app.suppress_invoice_created for their transaction.
  if new.invoice_number is not null
     and (tg_op = 'INSERT' or old.invoice_number is null)
     and coalesce(current_setting('app.suppress_invoice_created', true), '') <> 'on' then
    insert into crm_automation_trigger_queue (org_id, client_id, trigger_type, invoice_id)
    values (new.org_id, new.client_id, 'invoice_created', new.id)
    on conflict (trigger_type, invoice_id) where invoice_id is not null do nothing;
  end if;

  -- invoice_sent: the first move out of draft into sent (Mark as Sent / email)
  -- or printed (Print).
  if tg_op = 'UPDATE' and old.status = 'draft' and new.status in ('sent', 'printed') then
    insert into crm_automation_trigger_queue (org_id, client_id, trigger_type, invoice_id)
    values (new.org_id, new.client_id, 'invoice_sent', new.id)
    on conflict (trigger_type, invoice_id) where invoice_id is not null do nothing;
  end if;

  return null;
end;
$function$;

revoke all on function public.trg_crm_invoices_queue_automation_events() from public, anon, authenticated;

drop trigger if exists trg_crm_invoices_queue_automation_events on public.crm_invoices;
create trigger trg_crm_invoices_queue_automation_events
  after insert or update of invoice_number, status on public.crm_invoices
  for each row execute function public.trg_crm_invoices_queue_automation_events();

-- ── inline claim (service role only) ─────────────────────────────────────────
-- True exactly once per (invoice, trigger type): the caller that gets true fires
-- the event now; the drain never fires a claimed row. Claims the row the trigger
-- queued, or records one when none exists yet (e.g. an invoice inserted already
-- 'sent' and then emailed). A row the drain is firing right now (lease held) is
-- left to it.
create or replace function public.claim_invoice_automation_event(p_invoice_id uuid, p_trigger_type text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_client uuid;
  v_id uuid;
begin
  if p_trigger_type not in ('invoice_created', 'invoice_sent') then
    raise exception 'unsupported trigger type %', p_trigger_type using errcode = '22023';
  end if;
  select org_id, client_id into v_org, v_client
    from crm_invoices where id = p_invoice_id and deleted_at is null;
  if v_org is null or v_client is null then
    return false;
  end if;

  insert into crm_automation_trigger_queue (org_id, client_id, trigger_type, invoice_id, processed_at)
  values (v_org, v_client, p_trigger_type, p_invoice_id, now())
  on conflict (trigger_type, invoice_id) where invoice_id is not null do nothing
  returning id into v_id;
  if v_id is not null then
    return true;
  end if;

  update crm_automation_trigger_queue
     set processed_at = now(), updated_at = now(), claimed_until = null
   where trigger_type = p_trigger_type
     and invoice_id = p_invoice_id
     and processed_at is null
     and (claimed_until is null or claimed_until < now())
  returning id into v_id;
  return v_id is not null;
end;
$function$;

revoke all on function public.claim_invoice_automation_event(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_invoice_automation_event(uuid, text) to service_role;

-- ── numbering without the automation (CSV import of historical invoices) ─────
create or replace function public.assign_invoice_number(p_invoice_id uuid, p_suppress_automation boolean)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_suppress_automation then
    perform set_config('app.suppress_invoice_created', 'on', true);
  end if;
  -- Same function, same org/role guard (pg_trigger_depth() is still 0 here).
  return public.assign_invoice_number(p_invoice_id);
end;
$function$;

revoke all on function public.assign_invoice_number(uuid, boolean) from public, anon;
grant execute on function public.assign_invoice_number(uuid, boolean) to authenticated, service_role;

-- ── seed: invoices whose event already ran never fire it again ───────────────
insert into public.crm_automation_trigger_queue (org_id, client_id, trigger_type, invoice_id, processed_at)
select distinct on (e.trigger_type, i.id) i.org_id, i.client_id, e.trigger_type, i.id, now()
  from public.crm_sequence_enrollments e
  join public.crm_invoices i on i.id = e.invoice_id
 where e.trigger_type in ('invoice_created', 'invoice_sent')
   and i.client_id is not null
on conflict (trigger_type, invoice_id) where invoice_id is not null do nothing;
