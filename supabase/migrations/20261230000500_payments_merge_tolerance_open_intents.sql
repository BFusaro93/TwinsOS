-- Bug sweep round 10 — Portal & online payments.
--
-- 1. A payment in flight while Merge Clients runs could never be recorded:
--    the intent's metadata still names the duplicate (now soft-deleted), its
--    invoices moved to the kept client, and record_stripe_invoice_payment
--    raised "Invoice … does not belong to client …" on every webhook retry.
--    • clients.merged_into_client_id — set by crm_merge_clients (only), and
--      backfilled for merges already done from their timeline notes.
--    • resolve_merged_client() follows it; record_stripe_invoice_payment
--      records against the client that absorbed the duplicate.
--    • Merge Clients refuses while the duplicate has a payment in flight.
--    • Attribution failures raise SQLSTATE 'UNREC' so the webhook can alert an
--      admin and acknowledge instead of 500-ing forever.
--    • A parent paying sub-account invoices now re-syncs those balances too.
-- 2. Open (not yet confirmed) PaymentIntents are remembered per invoice in
--    crm_open_payment_intents so the pay page reuses one instead of minting a
--    second, and any change that makes the open form stale (paid, voided,
--    deleted, moved to another client, total or amount paid changed) queues the
--    intent in crm_payment_intent_cancellations for the app to cancel at
--    Stripe. Kept off crm_invoices itself so opening a pay form doesn't write
--    an audit-trail entry every time.

-- ── clients.merged_into_client_id ───────────────────────────────────────────

alter table public.clients
  add column if not exists merged_into_client_id uuid references public.clients(id);

create index if not exists clients_merged_into_client_id_idx
  on public.clients (merged_into_client_id)
  where merged_into_client_id is not null;

comment on column public.clients.merged_into_client_id is
  'Set by crm_merge_clients on the retired duplicate: the client that absorbed it. Payments still naming the duplicate are recorded there.';

create or replace function public.guard_clients_merged_into()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.merged_into_client_id is distinct from
       (case when tg_op = 'UPDATE' then old.merged_into_client_id else null end)
     and coalesce(current_setting('app.client_merge_rpc', true), '') = '' then
    raise exception 'merged_into_client_id is only set by Merge Clients' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_guard_merged_into on public.clients;
create trigger trg_clients_guard_merged_into
  before insert or update of merged_into_client_id on public.clients
  for each row execute function public.guard_clients_merged_into();

-- Backfill merges already done: crm_merge_clients writes a "Merged into …"
-- note on the duplicate and a "Merged from <duplicate>" note on the kept
-- client in the same statement (same occurred_at).
select set_config('app.client_merge_rpc', 'backfill', true);
with pairs as (
  select distinct on (am.client_id) am.client_id as merged_id, ak.client_id as kept_id
    from public.client_activity am
    join public.clients m on m.id = am.client_id
    join public.client_activity ak
      on ak.org_id = am.org_id
     and ak.occurred_at = am.occurred_at
     and ak.activity_type = 'note'
     and ak.subject = 'Merged from ' || m.display_name
     and ak.client_id <> am.client_id
   where am.activity_type = 'note'
     and am.subject like 'Merged into %'
     and m.deleted_at is not null
     and m.merged_into_client_id is null
   order by am.client_id, am.occurred_at desc
)
update public.clients c
   set merged_into_client_id = p.kept_id
  from pairs p
 where c.id = p.merged_id;
select set_config('app.client_merge_rpc', '', true);

-- The live client a payment naming p_client_id belongs to: follows the merge
-- chain while the record is retired. Returns p_client_id itself when it isn't
-- a merged duplicate (including a plain soft-delete, which keeps the old
-- behaviour of recording against it).
create or replace function public.resolve_merged_client(p_org_id uuid, p_client_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := p_client_id;
  v_deleted timestamptz;
  v_next uuid;
  i int := 0;
begin
  loop
    select c.deleted_at, c.merged_into_client_id into v_deleted, v_next
      from public.clients c
     where c.id = v_id and c.org_id = p_org_id;
    if not found or v_deleted is null or v_next is null or i >= 10 then
      return v_id;
    end if;
    v_id := v_next;
    i := i + 1;
  end loop;
end;
$$;

revoke all on function public.resolve_merged_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_merged_client(uuid, uuid) to service_role;

-- ── open payment intents + cancellation queue ───────────────────────────────

create table if not exists public.crm_open_payment_intents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  invoice_id uuid not null references public.crm_invoices(id) on delete cascade,
  payment_intent_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (invoice_id)
);
create index if not exists crm_open_payment_intents_intent_idx
  on public.crm_open_payment_intents (payment_intent_id);

comment on table public.crm_open_payment_intents is
  'The PaymentIntent a customer pay form (public link / portal) is open on, per invoice. A combined payment has one row per invoice with the same intent. Service role only.';

create table if not exists public.crm_payment_intent_cancellations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  payment_intent_id text not null unique,
  reason text,
  attempts integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists crm_payment_intent_cancellations_pending_idx
  on public.crm_payment_intent_cancellations (org_id)
  where processed_at is null;

comment on table public.crm_payment_intent_cancellations is
  'Open PaymentIntents made stale by another change to their invoice, waiting to be canceled at Stripe (cron + the payment routes drain it). Service role only.';

-- Service role only: no policies on purpose (deny-all for every user role).
alter table public.crm_open_payment_intents enable row level security;
alter table public.crm_payment_intent_cancellations enable row level security;
revoke all on public.crm_open_payment_intents from anon, authenticated;
revoke all on public.crm_payment_intent_cancellations from anon, authenticated;

drop trigger if exists trg_crm_open_payment_intents_updated_at on public.crm_open_payment_intents;
create trigger trg_crm_open_payment_intents_updated_at
  before update on public.crm_open_payment_intents
  for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_payment_intent_cancellations_updated_at on public.crm_payment_intent_cancellations;
create trigger trg_crm_payment_intent_cancellations_updated_at
  before update on public.crm_payment_intent_cancellations
  for each row execute function public.set_updated_at();

-- Any change that makes an open pay form stale queues its intent for
-- cancellation, whichever path made it (staff payment, saved-card charge,
-- void, delete, Merge Clients, invoice merge, a total edit, credit applied).
create or replace function public.queue_stale_open_payment_intents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  r record;
begin
  v_reason := case
    when new.deleted_at is not null and old.deleted_at is null then 'invoice deleted'
    when new.status is distinct from old.status and new.status = 'void' then 'invoice voided'
    when new.client_id is distinct from old.client_id then 'invoice moved to another client'
    when new.status is distinct from old.status and new.status = 'paid' then 'invoice paid'
    when new.total_cents is distinct from old.total_cents then 'invoice total changed'
    else 'amount paid changed'
  end;
  for r in
    select distinct o.payment_intent_id
      from public.crm_open_payment_intents o
     where o.invoice_id = new.id
  loop
    insert into public.crm_payment_intent_cancellations (org_id, payment_intent_id, reason)
    values (new.org_id, r.payment_intent_id, v_reason)
    on conflict (payment_intent_id) do nothing;
    delete from public.crm_open_payment_intents where payment_intent_id = r.payment_intent_id;
  end loop;
  return null;
end;
$$;

revoke all on function public.queue_stale_open_payment_intents() from public, anon, authenticated;

drop trigger if exists trg_crm_invoices_queue_stale_open_intents on public.crm_invoices;
create trigger trg_crm_invoices_queue_stale_open_intents
  after update on public.crm_invoices
  for each row
  when (
    (new.deleted_at is not null and old.deleted_at is null)
    or (new.status is distinct from old.status and new.status in ('paid', 'void'))
    or new.client_id is distinct from old.client_id
    or new.total_cents is distinct from old.total_cents
    or new.amount_paid_cents is distinct from old.amount_paid_cents
  )
  execute function public.queue_stale_open_payment_intents();

-- ── Merge Clients: refuse while a payment is in flight; record merged_into ──

CREATE OR REPLACE FUNCTION public._crm_merge_clients_check(p_keep uuid, p_merge uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.my_org_id();
  k public.clients%rowtype;
  m public.clients%rowtype;
begin
  if auth.uid() is null or v_org is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not public.has_settings_permission('client_allow_delete') then
    raise exception 'You do not have permission to merge clients' using errcode = '42501';
  end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different clients to merge' using errcode = '22023';
  end if;

  select * into k from public.clients where id = p_keep;
  select * into m from public.clients where id = p_merge;
  if k.id is null or m.id is null or k.org_id is distinct from v_org or m.org_id is distinct from v_org then
    raise exception 'Client not found' using errcode = '42501';
  end if;
  if k.deleted_at is not null or m.deleted_at is not null then
    raise exception 'Both clients must be live records — one of them has already been deleted'
      using errcode = '22023';
  end if;

  -- Jobs and invoices can't belong to a lead, so a lead can only absorb another lead.
  if k.status in ('lead', 'lost') and m.status not in ('lead', 'lost') then
    raise exception '% is a lead and % is a client. Keep the client record and merge the lead into it.',
      k.display_name, m.display_name
      using errcode = '22023';
  end if;

  -- One level of hierarchy: a sub-account can't take over sub-accounts.
  if k.parent_client_id is not null and k.parent_client_id <> m.id
     and exists (select 1 from public.clients c
                  where c.parent_client_id = m.id and c.deleted_at is null and c.id <> k.id) then
    raise exception '% is a sub-account of another client, so it can''t take over the sub-accounts of %. Keep % instead, or unlink first.',
      k.display_name, m.display_name, m.display_name
      using errcode = '22023';
  end if;

  -- A payment for the duplicate's invoices or proposal deposits that is still in
  -- flight (an ACH debit settling, or a bank account waiting on micro-deposit
  -- verification) names the duplicate in its Stripe metadata. Merging now would
  -- move the invoice out from under it. The recorders tolerate a merge (they
  -- follow clients.merged_into_client_id), but refusing here keeps the common
  -- case clean. Markers older than 21 days are leftovers of a missed clear and
  -- don't block.
  if exists (select 1 from public.crm_invoices i
              where i.client_id = m.id and i.deleted_at is null
                and i.pending_payment_intent_id is not null
                and coalesce(i.pending_payment_at, now()) > now() - interval '21 days') then
    raise exception '% has an online payment in progress (a bank transfer that hasn''t settled yet, or one waiting on bank verification). Merge after it settles — usually within a few business days.',
      m.display_name
      using errcode = '22023';
  end if;
  if exists (select 1 from public.estimates e
              where e.client_id = m.id and e.deleted_at is null
                and e.deposit_pending_at is not null
                and e.deposit_pending_at > now() - interval '21 days') then
    raise exception '% has a proposal deposit payment in progress. Merge after it settles — usually within a few business days.',
      m.display_name
      using errcode = '22023';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_merge_clients(p_keep uuid, p_merge uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k public.clients%rowtype;
  m public.clients%rowtype;
  r record;
  v_n bigint;
  v_counts jsonb := '{}'::jsonb;
  v_dedupe jsonb := '{}'::jsonb;
  v_notes text[] := '{}';
  v_now timestamptz := now();
  v_move_card boolean;
  v_move_qbo boolean;
  v_take_phone boolean;
  v_take_billing boolean;
  v_take_service boolean;
  v_take_parent boolean;
  v_email text;
  v_bounced timestamptz;
  v_phones jsonb;
  v_digits text;
  v_body text;
begin
  perform public._crm_merge_clients_check(p_keep, p_merge);

  -- Lock both rows in a fixed order, then re-check against the locked state.
  perform 1 from public.clients where id in (p_keep, p_merge) order by id for update;
  perform public._crm_merge_clients_check(p_keep, p_merge);
  select * into k from public.clients where id = p_keep;
  select * into m from public.clients where id = p_merge;

  perform set_config('app.client_merge_rpc', p_merge::text || ':' || p_keep::text, true);

  -- ── hierarchy ──
  -- The kept client is a sub-account of the duplicate: it takes the
  -- duplicate's place at the top (the duplicate has no parent of its own).
  if k.parent_client_id = m.id then
    update public.clients set parent_client_id = null where id = k.id;
    k.parent_client_id := null;
  end if;

  if k.parent_client_id is null then
    update public.clients set parent_client_id = p_keep
     where parent_client_id = p_merge and id <> p_keep;
  else
    -- A sub-account can't have sub-accounts; _crm_merge_clients_check already
    -- refused if the duplicate has live ones, so only deleted ones are left.
    update public.clients set parent_client_id = null
     where parent_client_id = p_merge and id <> p_keep;
  end if;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('sub_accounts', v_n); end if;

  update public.clients set referred_by_client_id = p_keep
   where referred_by_client_id = p_merge and id <> p_keep;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('referrals', v_n); end if;

  -- ── rows that would collide with the kept client's own ──
  -- Tags the kept client already has.
  delete from public.client_tags t
   where t.client_id = p_merge
     and exists (select 1 from public.client_tags kt where kt.client_id = p_keep and kt.tag = t.tag);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_dedupe := v_dedupe || jsonb_build_object('client_tags', v_n); end if;

  -- Custom fields: the kept client's value wins; an empty one is filled.
  update public.crm_client_custom_field_values kv
     set value_text = coalesce(nullif(kv.value_text, ''), mv.value_text),
         value_number = coalesce(kv.value_number, mv.value_number),
         updated_at = v_now
    from public.crm_client_custom_field_values mv
   where kv.client_id = p_keep and mv.client_id = p_merge and mv.field_def_id = kv.field_def_id
     and ((nullif(kv.value_text, '') is null and nullif(mv.value_text, '') is not null)
          or (kv.value_number is null and mv.value_number is not null));
  delete from public.crm_client_custom_field_values mv
   where mv.client_id = p_merge
     and exists (select 1 from public.crm_client_custom_field_values kv
                  where kv.client_id = p_keep and kv.field_def_id = mv.field_def_id);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_dedupe := v_dedupe || jsonb_build_object('crm_client_custom_field_values', v_n); end if;

  -- The same inbound text logged on both (shared phone number).
  delete from public.client_activity a
   where a.client_id = p_merge and a.ref_table = 'twilio_messages' and a.direction = 'inbound'
     and exists (select 1 from public.client_activity ka
                  where ka.client_id = p_keep and ka.ref_id = a.ref_id
                    and ka.ref_table = 'twilio_messages' and ka.direction = 'inbound');
  get diagnostics v_n = row_count;
  if v_n > 0 then v_dedupe := v_dedupe || jsonb_build_object('client_activity', v_n); end if;

  -- Both enrolled in the same client-level sequence: the kept enrollment runs on.
  update public.crm_sequence_enrollments e
     set stopped_at = v_now, status = 'stopped', updated_at = v_now
   where e.client_id = p_merge
     and e.estimate_id is null and e.ticket_id is null and e.invoice_id is null and e.meeting_id is null
     and e.completed_at is null and e.stopped_at is null and e.deleted_at is null
     and exists (select 1 from public.crm_sequence_enrollments ke
                  where ke.client_id = p_keep and ke.sequence_id = e.sequence_id
                    and ke.estimate_id is null and ke.ticket_id is null and ke.invoice_id is null and ke.meeting_id is null
                    and ke.completed_at is null and ke.stopped_at is null and ke.deleted_at is null);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_dedupe := v_dedupe || jsonb_build_object('crm_sequence_enrollments_stopped', v_n); end if;

  -- Both have an open auto-bill draft for the same period: the duplicate's
  -- becomes an ordinary draft (its lines are kept; nothing is re-billed).
  update public.crm_invoices i
     set auto_bill_period_start = null
   where i.client_id = p_merge and i.auto_bill_period_start is not null
     and i.status = 'draft' and i.deleted_at is null and i.locked = false
     and exists (select 1 from public.crm_invoices ki
                  where ki.client_id = p_keep and ki.org_id = i.org_id
                    and ki.auto_bill_period_start = i.auto_bill_period_start
                    and coalesce(ki.tax_rate_bps, 0) = coalesce(i.tax_rate_bps, 0)
                    and ki.status = 'draft' and ki.deleted_at is null and ki.locked = false);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_dedupe := v_dedupe || jsonb_build_object('auto_bill_drafts_detached', v_n); end if;

  -- One master property / one primary contact: the kept client's stay.
  if exists (select 1 from public.client_properties where client_id = p_keep and is_master and deleted_at is null) then
    update public.client_properties set is_master = false
     where client_id = p_merge and is_master;
  end if;
  if exists (select 1 from public.client_contacts where client_id = p_keep and is_primary and deleted_at is null) then
    update public.client_contacts set is_primary = false
     where client_id = p_merge and is_primary;
  end if;

  -- ── repoint every foreign key to clients ──
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.clients'::regclass
       and c.conrelid <> 'public.clients'::regclass
       and array_length(c.conkey, 1) = 1
     order by 1, 2
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using p_keep, p_merge;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_counts := jsonb_set(v_counts, array[r.tbl], to_jsonb(coalesce((v_counts ->> r.tbl)::bigint, 0) + v_n));
    end if;
  end loop;

  -- ── references without a foreign key ──
  update public.notifications set entity_id = p_keep
   where entity_type = 'client' and entity_id = p_merge;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('notifications', v_n); end if;

  update public.crm_campaigns
     set audience_client_ids = array_remove(audience_client_ids, p_merge)
           || case when p_keep = any (audience_client_ids) then '{}'::uuid[] else array[p_keep] end
   where org_id = k.org_id and p_merge = any (audience_client_ids);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('crm_campaigns', v_n); end if;

  -- ── what carries over ──
  v_move_card := k.stripe_customer_id is null and k.saved_payment_method_id is null
             and (m.stripe_customer_id is not null or m.saved_payment_method_id is not null);
  if k.stripe_customer_id is not null and m.stripe_customer_id is not null
     and k.stripe_customer_id <> m.stripe_customer_id then
    v_notes := v_notes || format('%s''s Stripe customer%s was not carried over — %s keeps its own.',
      m.display_name,
      case when m.saved_payment_method_summary is not null then ' and saved payment method (' || m.saved_payment_method_summary || ')' else '' end,
      k.display_name);
  end if;

  v_move_qbo := k.qbo_customer_id is null and m.qbo_customer_id is not null;
  if k.qbo_customer_id is not null and m.qbo_customer_id is not null and k.qbo_customer_id <> m.qbo_customer_id then
    v_notes := v_notes || format('Both records were linked to QuickBooks. %s stays linked to QuickBooks customer %s; %s''s QuickBooks customer %s is no longer linked — merge or make it inactive in QuickBooks.',
      k.display_name, k.qbo_customer_id, m.display_name, m.qbo_customer_id);
  end if;

  v_take_phone := nullif(btrim(k.primary_phone), '') is null and nullif(btrim(m.primary_phone), '') is not null;
  -- "Billing same as service" means the kept client has no separate billing address to fill.
  v_take_billing := not k.billing_same_as_service
    and nullif(btrim(k.billing_address), '') is null and nullif(btrim(m.billing_address), '') is not null;
  v_take_service := nullif(btrim(k.service_address), '') is null and nullif(btrim(m.service_address), '') is not null;
  v_take_parent := k.parent_client_id is null and m.parent_client_id is not null and m.parent_client_id <> k.id
    and not exists (select 1 from public.clients c where c.parent_client_id = k.id and c.deleted_at is null);

  -- Contact details of the duplicate that don't survive as fields are kept in the note.
  if nullif(btrim(m.primary_email), '') is not null and nullif(btrim(k.primary_email), '') is not null
     and lower(btrim(m.primary_email)) <> lower(btrim(k.primary_email)) then
    v_notes := v_notes || format('Other email: %s', m.primary_email);
  end if;
  if not v_take_billing and nullif(btrim(m.billing_address), '') is not null
     and lower(btrim(m.billing_address)) <> lower(btrim(coalesce(k.billing_address, ''))) then
    v_notes := v_notes || format('Other billing address: %s', concat_ws(', ', m.billing_address, m.billing_city, m.billing_state, m.billing_zip));
  end if;
  if not v_take_service and nullif(btrim(m.service_address), '') is not null
     and lower(btrim(m.service_address)) <> lower(btrim(coalesce(k.service_address, ''))) then
    v_notes := v_notes || format('Other service address: %s', concat_ws(', ', m.service_address, m.service_city, m.service_state, m.service_zip));
  end if;

  -- Phones: the duplicate's numbers the kept client doesn't already have.
  v_phones := case when jsonb_typeof(k.phones) = 'array' then k.phones else '[]'::jsonb end;
  if jsonb_typeof(m.phones) = 'array' then
    for r in select e from jsonb_array_elements(m.phones) as e loop
      v_digits := right(regexp_replace(coalesce(r.e ->> 'phone', ''), '\D', '', 'g'), 10);
      continue when v_digits = '';
      continue when exists (
        select 1 from jsonb_array_elements(v_phones) ke
         where right(regexp_replace(coalesce(ke ->> 'phone', ''), '\D', '', 'g'), 10) = v_digits);
      v_phones := v_phones || jsonb_build_array(
        case when jsonb_array_length(v_phones) > 0 and jsonb_typeof(r.e) = 'object'
             then r.e || '{"isPrimary": false}'::jsonb else r.e end);
    end loop;
  end if;

  -- Bounce state follows the address: it carries over only when the kept
  -- client ends up with the duplicate's (bounced) address.
  v_email := coalesce(nullif(btrim(k.primary_email), ''), nullif(btrim(m.primary_email), ''));
  v_bounced := k.email_bounced_at;
  if v_email is not null and lower(v_email) = lower(btrim(coalesce(m.primary_email, ''))) and m.email_bounced_at is not null then
    v_bounced := least(coalesce(k.email_bounced_at, m.email_bounced_at), m.email_bounced_at);
  end if;

  -- ── retire the duplicate ──
  update public.clients
     set deleted_at = v_now,
         -- Where a payment still naming the duplicate gets recorded (see
         -- record_stripe_invoice_payment / resolve_merged_client).
         merged_into_client_id = p_keep,
         autopay_enabled = false,
         stripe_customer_id = case when v_move_card then null else stripe_customer_id end,
         saved_payment_method_id = case when v_move_card then null else saved_payment_method_id end,
         saved_payment_method_type = case when v_move_card then null else saved_payment_method_type end,
         saved_payment_method_summary = case when v_move_card then null else saved_payment_method_summary end,
         qbo_customer_id = case when v_move_qbo then null else qbo_customer_id end
   where id = p_merge;

  -- Records merged into the duplicate earlier now point straight at the kept client.
  update public.clients set merged_into_client_id = p_keep
   where merged_into_client_id = p_merge and id <> p_keep;

  -- ── fill the kept client ──
  update public.clients c set
    first_name = coalesce(nullif(btrim(k.first_name), ''), m.first_name),
    last_name = coalesce(nullif(btrim(k.last_name), ''), m.last_name),
    primary_phone = case when v_take_phone then m.primary_phone else k.primary_phone end,
    phones = v_phones,
    sms_opt_in = case when v_take_phone then m.sms_opt_in else k.sms_opt_in end,
    sms_opt_in_at = case when v_take_phone then m.sms_opt_in_at else k.sms_opt_in_at end,
    sms_opt_in_source = case when v_take_phone then m.sms_opt_in_source else k.sms_opt_in_source end,
    primary_email = v_email,
    billing_email = coalesce(nullif(btrim(k.billing_email), ''), m.billing_email),
    email_bounced_at = v_bounced,
    do_not_market = k.do_not_market or m.do_not_market,
    ok_to_email = k.ok_to_email and m.ok_to_email,
    billing_address = case when v_take_billing then m.billing_address else k.billing_address end,
    billing_city = case when v_take_billing then m.billing_city else k.billing_city end,
    billing_state = case when v_take_billing then m.billing_state else k.billing_state end,
    billing_zip = case when v_take_billing then m.billing_zip else k.billing_zip end,
    billing_country = case when v_take_billing then m.billing_country else k.billing_country end,
    service_address = case when v_take_service then m.service_address else k.service_address end,
    service_city = case when v_take_service then m.service_city else k.service_city end,
    service_state = case when v_take_service then m.service_state else k.service_state end,
    service_zip = case when v_take_service then m.service_zip else k.service_zip end,
    lat = case when v_take_service then m.lat else k.lat end,
    lng = case when v_take_service then m.lng else k.lng end,
    address_verdict = case when v_take_service then m.address_verdict else k.address_verdict end,
    address_verified_at = case when v_take_service then m.address_verified_at else k.address_verified_at end,
    invoice_frequency = coalesce(k.invoice_frequency, m.invoice_frequency),
    invoice_delivery = coalesce(k.invoice_delivery, m.invoice_delivery),
    payment_method = coalesce(nullif(btrim(k.payment_method), ''), m.payment_method),
    billing_terms = coalesce(nullif(btrim(k.billing_terms), ''), m.billing_terms),
    sales_tax_code = coalesce(nullif(btrim(k.sales_tax_code), ''), m.sales_tax_code),
    default_terms = coalesce(nullif(btrim(k.default_terms), ''), m.default_terms),
    default_payment_method = coalesce(nullif(btrim(k.default_payment_method), ''), m.default_payment_method),
    sales_rep_id = coalesce(k.sales_rep_id, m.sales_rep_id),
    source = coalesce(nullif(btrim(k.source), ''), m.source),
    referred_by = coalesce(nullif(btrim(k.referred_by), ''), m.referred_by),
    referred_by_client_id = case
      when k.referred_by_client_id = p_merge then
        case when m.referred_by_client_id is distinct from p_keep then m.referred_by_client_id end
      when k.referred_by_client_id is null and m.referred_by_client_id is distinct from p_keep then m.referred_by_client_id
      else k.referred_by_client_id end,
    parent_client_id = case when v_take_parent then m.parent_client_id else k.parent_client_id end,
    client_since = least(k.client_since, m.client_since),
    account_number = coalesce(nullif(btrim(k.account_number), ''), m.account_number),
    priority = coalesce(k.priority, m.priority),
    map_code = coalesce(nullif(btrim(k.map_code), ''), m.map_code),
    gate_lock_code = coalesce(nullif(btrim(k.gate_lock_code), ''), m.gate_lock_code),
    turf_sqft = coalesce(k.turf_sqft, m.turf_sqft),
    mulch_bed_sqft = coalesce(k.mulch_bed_sqft, m.mulch_bed_sqft),
    gross_sqft = coalesce(k.gross_sqft, m.gross_sqft),
    linear_ft_perimeter = coalesce(k.linear_ft_perimeter, m.linear_ft_perimeter),
    linear_ft_edging = coalesce(k.linear_ft_edging, m.linear_ft_edging),
    yards_of_mulch = coalesce(k.yards_of_mulch, m.yards_of_mulch),
    parking_lot_sqft = coalesce(k.parking_lot_sqft, m.parking_lot_sqft),
    revenue_potential_cents = case when k.revenue_potential_cents = 0 then m.revenue_potential_cents else k.revenue_potential_cents end,
    office_notes = case
      when nullif(btrim(m.office_notes), '') is null then k.office_notes
      when nullif(btrim(k.office_notes), '') is null then m.office_notes
      when btrim(k.office_notes) = btrim(m.office_notes) then k.office_notes
      else k.office_notes || E'\n\n' || m.office_notes end,
    notes_to_crew = case
      when nullif(btrim(m.notes_to_crew), '') is null then k.notes_to_crew
      when nullif(btrim(k.notes_to_crew), '') is null then m.notes_to_crew
      when btrim(k.notes_to_crew) = btrim(m.notes_to_crew) then k.notes_to_crew
      else k.notes_to_crew || E'\n\n' || m.notes_to_crew end,
    stripe_customer_id = case when v_move_card then m.stripe_customer_id else k.stripe_customer_id end,
    saved_payment_method_id = case when v_move_card then m.saved_payment_method_id else k.saved_payment_method_id end,
    saved_payment_method_type = case when v_move_card then m.saved_payment_method_type else k.saved_payment_method_type end,
    saved_payment_method_summary = case when v_move_card then m.saved_payment_method_summary else k.saved_payment_method_summary end,
    autopay_enabled = case when v_move_card then m.autopay_enabled else k.autopay_enabled end,
    qbo_customer_id = case when v_move_qbo then m.qbo_customer_id else k.qbo_customer_id end
  where c.id = p_keep;

  perform public.sync_client_balance(p_keep);
  perform public.sync_client_balance(p_merge);

  -- ── timeline ──
  select string_agg(format('%s %s', s.value, s.label), ', ' order by s.ord) filter (where s.label is not null),
         sum(s.value) filter (where s.label is null)
    into v_body, v_n
    from (
      select e.value::bigint as value, l.label, l.ord
        from jsonb_each_text(v_counts) e
        left join (values
          ('client_properties', 'properties', 1), ('client_contacts', 'contacts', 2),
          ('crm_jobs', 'jobs', 3), ('crm_job_visits', 'visits', 4),
          ('estimates', 'estimates', 5), ('crm_contracts', 'contracts', 6),
          ('crm_invoices', 'invoices', 7), ('crm_payments', 'payments/credits', 8),
          ('crm_tickets', 'tickets', 9), ('client_files', 'files', 10),
          ('client_activity', 'timeline entries', 11), ('sub_accounts', 'sub-accounts', 12)
        ) as l(key, label, ord) on l.key = e.key
    ) s;
  v_body := format('%s (%s) was merged into this client. Moved: %s.',
    m.display_name, coalesce(m.account_number, 'no account #'),
    concat_ws(', ',
      nullif(v_body, ''),
      case when coalesce(v_n, 0) > 0 then v_n || ' other records' end,
      case when v_counts = '{}'::jsonb then 'nothing' end));
  if array_length(v_notes, 1) > 0 then
    v_body := v_body || E'\n' || array_to_string(v_notes, E'\n');
  end if;
  insert into public.client_activity (org_id, client_id, activity_type, subject, body, occurred_at, created_by)
  values (k.org_id, p_keep, 'note', 'Merged from ' || m.display_name, v_body, v_now, auth.uid());

  insert into public.client_activity (org_id, client_id, activity_type, subject, body, occurred_at, created_by)
  values (m.org_id, p_merge, 'note', 'Merged into ' || k.display_name,
          format('This record was a duplicate of %s (%s). Its history now lives there.',
                 k.display_name, coalesce(k.account_number, 'no account #')),
          v_now, auth.uid());

  perform set_config('app.client_merge_rpc', '', true);

  return jsonb_build_object(
    'kept_client_id', p_keep,
    'merged_client_id', p_merge,
    'moved', v_counts,
    'deduplicated', v_dedupe,
    'notes', to_jsonb(v_notes)
  );
end;
$function$;

-- ── record_stripe_invoice_payment: follow merges; flag unrecordable ──────────

CREATE OR REPLACE FUNCTION public.record_stripe_invoice_payment(p_org_id uuid, p_client_id uuid, p_payment_intent_id text, p_allocations jsonb, p_fee_cents integer, p_method text, p_payment_date date, p_channel_label text)
 RETURNS TABLE(result text, payment_id uuid, amount_cents integer, applied_cents integer, unused_cents integer, newly_paid_invoice_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_existing       uuid;
  v_req            record;
  v_inv            record;
  v_allocated      integer;
  v_apply          integer;
  v_total          integer := 0;
  v_applied_total  integer := 0;
  v_applied        jsonb := '[]'::jsonb;
  v_elem           jsonb;
  v_invoice_count  integer := 0;
  v_single_invoice uuid;
  v_payment_id     uuid;
  v_unused         integer;
  v_label          text := coalesce(nullif(p_channel_label, ''), 'card');
  v_new_paid       integer;
  v_new_balance    integer;
  v_open_status    text;
  v_new_status     text;
  v_newly_paid     uuid[] := '{}';
  v_payer          uuid;
  v_inv_clients    uuid[] := '{}';
  v_sync_client    uuid;
begin
  if p_payment_intent_id is null or length(p_payment_intent_id) = 0 then
    raise exception 'A Stripe PaymentIntent id is required';
  end if;
  if p_org_id is null or p_client_id is null then
    raise exception 'org and client are required';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'At least one invoice allocation is required';
  end if;

  -- Serialize concurrent writers for the same PaymentIntent (webhook vs the
  -- synchronous charge route) so the loser sees the winner's committed row.
  perform pg_advisory_xact_lock(hashtextextended('crm_payment_pi:' || p_payment_intent_id, 0));

  select p.id into v_existing
    from public.crm_payments p
    where p.stripe_payment_intent_id = p_payment_intent_id;
  if found then
    return query select 'already_recorded'::text, v_existing, null::integer, null::integer, null::integer, '{}'::uuid[];
    return;
  end if;

  if not exists (select 1 from public.clients c where c.id = p_client_id and c.org_id = p_org_id) then
    raise exception 'Client % not found in this organization', p_client_id
      using errcode = 'UNREC';
  end if;

  -- The client named in the intent's metadata may have been merged into
  -- another record while the payment was in flight (an ACH debit settles days
  -- later). Its invoices moved to the client that absorbed it, so record the
  -- payment there instead of refusing it forever.
  v_payer := public.resolve_merged_client(p_org_id, p_client_id);

  -- A single-invoice payment whose client was merged into a record the invoice
  -- no longer sits under (e.g. a sub-account merged into a different client):
  -- the invoice's own current client is the payer.
  if v_payer is distinct from p_client_id and jsonb_array_length(p_allocations) = 1 then
    select i.client_id into v_sync_client
      from public.crm_invoices i
     where i.id = (p_allocations -> 0 ->> 'invoice_id')::uuid and i.org_id = p_org_id;
    if v_sync_client is not null
       and v_sync_client is distinct from v_payer
       and not exists (select 1 from public.clients c where c.id = v_sync_client and c.parent_client_id = v_payer) then
      v_payer := v_sync_client;
    end if;
    v_sync_client := null;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_allocations) e
    where (e->>'invoice_id') is null
       or (e->>'amount_cents') is null
       or (e->>'amount_cents')::integer <= 0
  ) then
    raise exception 'Every allocation needs an invoice_id and a positive amount_cents';
  end if;

  -- Pass 1: lock + clamp. Duplicate invoice ids in the split are merged.
  for v_req in
    select (e->>'invoice_id')::uuid as invoice_id,
           sum((e->>'amount_cents')::integer)::integer as amount_cents
      from jsonb_array_elements(p_allocations) e
      group by 1
      order by 1
  loop
    select i.id, i.org_id, i.client_id, i.status, i.total_cents, i.amount_paid_cents, i.deleted_at
      into v_inv
      from public.crm_invoices i
      where i.id = v_req.invoice_id
      for update;

    if not found or v_inv.org_id is distinct from p_org_id then
      raise exception 'Invoice % not found in this organization', v_req.invoice_id
        using errcode = 'UNREC';
    end if;

    -- Same rule as guard_payment_allocation_client_match: the payment's
    -- client or one of its child sub-accounts.
    if v_inv.client_id is distinct from v_payer
       and not exists (
         select 1 from public.clients c
         where c.id = v_inv.client_id and c.parent_client_id = v_payer
       ) then
      raise exception 'Invoice % does not belong to client %', v_req.invoice_id, v_payer
        using errcode = 'UNREC';
    end if;
    if v_inv.client_id is distinct from v_payer and not (v_inv.client_id = any (v_inv_clients)) then
      v_inv_clients := v_inv_clients || v_inv.client_id;
    end if;

    if v_inv.deleted_at is not null or v_inv.status in ('draft', 'void') then
      -- Never apply to (or un-void) these — the whole share becomes credit.
      v_apply := 0;
    else
      select coalesce(sum(a.amount_cents), 0)::integer into v_allocated
        from public.crm_payment_allocations a
        where a.invoice_id = v_inv.id;
      v_apply := greatest(0, least(
        v_req.amount_cents,
        v_inv.total_cents - v_inv.amount_paid_cents,
        v_inv.total_cents - v_allocated
      ));
    end if;

    v_invoice_count := v_invoice_count + 1;
    v_total := v_total + v_req.amount_cents;
    v_applied_total := v_applied_total + v_apply;
    v_applied := v_applied || jsonb_build_object('invoice_id', v_inv.id, 'amount_cents', v_apply);
    if v_apply > 0 then
      v_single_invoice := v_inv.id;
    end if;
  end loop;

  v_unused := v_total - v_applied_total;

  -- crm_payments.invoice_id is only set for a single-invoice payment that
  -- actually landed on it. sync_client_balance() treats a payment with an
  -- invoice_id and NO allocation rows as fully applied (legacy fallback), so
  -- setting it on a payment credited entirely to the account (voided invoice)
  -- would make that credit vanish.
  if v_invoice_count <> 1 or v_applied_total = 0 then
    v_single_invoice := null;
  end if;

  insert into public.crm_payments (
    org_id, invoice_id, client_id, amount_cents, unused_amount_cents,
    payment_date, method, memo, is_prepayment, processing_fee_cents,
    stripe_payment_intent_id
  ) values (
    p_org_id, v_single_invoice, v_payer, v_total, v_unused,
    p_payment_date, p_method,
    case when v_unused > 0
      then format('Paid online via %s (exceeds invoice balance — excess credited to account)', v_label)
      else format('Paid online via %s', v_label)
    end,
    false, coalesce(p_fee_cents, 0), p_payment_intent_id
  )
  returning id into v_payment_id;

  -- Pass 2: allocations + invoice balances (rows still locked from pass 1).
  for v_elem in select * from jsonb_array_elements(v_applied)
  loop
    v_apply := (v_elem->>'amount_cents')::integer;
    continue when v_apply <= 0;

    insert into public.crm_payment_allocations (org_id, payment_id, invoice_id, amount_cents)
    values (p_org_id, v_payment_id, (v_elem->>'invoice_id')::uuid, v_apply);

    select i.id, i.status, i.total_cents, i.amount_paid_cents, i.invoice_number
      into v_inv
      from public.crm_invoices i
      where i.id = (v_elem->>'invoice_id')::uuid;

    -- Mirrors apply_payment_to_invoice()'s status rules exactly.
    v_new_paid    := greatest(0, v_inv.amount_paid_cents + v_apply);
    v_new_balance := greatest(0, v_inv.total_cents - v_new_paid);
    v_open_status := case when v_inv.status = 'printed' then 'printed' else 'sent' end;
    v_new_status  := case
      when v_new_balance <= 0 then 'paid'
      when v_new_paid > 0 then 'partial'
      else v_open_status
    end;

    update public.crm_invoices
      set amount_paid_cents = v_new_paid,
          balance_cents     = v_new_balance,
          status            = v_new_status
      where id = v_inv.id;

    if v_inv.invoice_number is null then
      perform public.assign_invoice_number(v_inv.id);
    end if;

    if v_new_status = 'paid' and v_inv.status is distinct from 'paid' then
      v_newly_paid := v_newly_paid || v_inv.id;
    end if;
  end loop;

  perform public.sync_client_balance(v_payer);
  -- A parent paying its sub-accounts' invoices: their balances moved too.
  foreach v_sync_client in array v_inv_clients loop
    perform public.sync_client_balance(v_sync_client);
  end loop;

  return query select 'applied'::text, v_payment_id, v_total, v_applied_total, v_unused, v_newly_paid;
end;
$function$;
