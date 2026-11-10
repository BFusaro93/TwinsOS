-- Merge duplicate clients.
--
-- crm_merge_clients(p_keep, p_merge) moves everything that references the
-- duplicate (p_merge) onto the kept client (p_keep), fills the kept client's
-- empty fields from the duplicate, soft-deletes the duplicate (status left
-- as-is) and logs "Merged from / Merged into" activity on both.
-- crm_merge_clients_preview(p_keep, p_merge) returns the same per-table
-- counts without changing anything, for the confirmation dialog.
--
-- Permission: an admin, or a crm_roles permission set with
-- client_allow_delete (the duplicate is retired). Both clients must be live,
-- different, and in the caller's org (NULL org fails closed).
--
-- Guards: the CRM write-permission triggers that key on
-- _crm_direct_user_write() already stand aside for a SECURITY DEFINER
-- function. Three triggers key on auth.uid() alone and would block a merger
-- who has client_allow_delete but not, say, tickets_view_modify. They now
-- honour the transaction-local GUC app.client_merge_rpc ("<merge>:<keep>"),
-- which only crm_merge_clients sets (is_local => true, cleared before it
-- returns), and only for the narrowest change the merge makes:
--   * crm_tickets: client_id moving from the duplicate to the kept client,
--     nothing else changed;
--   * crm_campaigns: only audience_client_ids changed;
--   * clients: the two clients being merged (notes / card / balance fill).
-- Every other write still goes through the guards exactly as before.

-- ── GUC helper ───────────────────────────────────────────────────────────────

create or replace function public._client_merge_rpc_active(p_client uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_client is not null
     and coalesce(current_setting('app.client_merge_rpc', true), '') <> ''
     and p_client::text = any (string_to_array(current_setting('app.client_merge_rpc', true), ':'));
$$;

-- ── guard triggers (live TEST definitions + the merge carve-out) ─────────────

CREATE OR REPLACE FUNCTION public.enforce_ticket_update_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  if auth.uid() is null then
    return new;
  end if;
  -- crm_merge_clients: the ticket only moves from the duplicate to the kept client.
  if public._client_merge_rpc_active(old.client_id)
     and public._client_merge_rpc_active(new.client_id)
     and old.client_id is distinct from new.client_id
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['client_id']) then
    return new;
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'crew' and old.created_by = auth.uid() then
    return new;
  end if;
  if not public.has_settings_permission('tickets_view_modify') then
    raise exception 'You do not have permission to modify tickets'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_campaign_update_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- crm_merge_clients: a hand-picked audience swaps the duplicate for the kept client.
  if coalesce(current_setting('app.client_merge_rpc', true), '') <> ''
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['audience_client_ids']) then
    return new;
  end if;
  if (new.status is distinct from old.status and new.status in ('scheduled', 'sending'))
     or (old.status = 'scheduled' and new.scheduled_at is distinct from old.scheduled_at) then
    if not public.has_settings_permission('campaign_send') then
      raise exception 'You do not have permission to schedule or send campaigns'
        using errcode = '42501';
    end if;
  elsif new.deleted_at is distinct from old.deleted_at then
    if not public.has_settings_permission('campaign_delete') then
      raise exception 'You do not have permission to delete campaigns'
        using errcode = '42501';
    end if;
  elsif not public.has_settings_permission('campaign_edit') then
    raise exception 'You do not have permission to edit campaigns'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_client_sensitive_column_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- crm_merge_clients: the kept client takes over the duplicate's notes /
  -- card / balances, and the duplicate is retired.
  if public._client_merge_rpc_active(new.id) then
    return new;
  end if;

  if nullif(new.office_notes, '') is distinct from nullif(old.office_notes, '')
     and not public.has_settings_permission('client_view_notes') then
    raise exception 'You do not have permission to change client notes'
      using errcode = '42501';
  end if;

  if (new.saved_payment_method_id, new.saved_payment_method_type,
      new.saved_payment_method_summary, new.stripe_customer_id)
     is distinct from
     (old.saved_payment_method_id, old.saved_payment_method_type,
      old.saved_payment_method_summary, old.stripe_customer_id)
     or (new.autopay_enabled is true and old.autopay_enabled is distinct from true) then
    if not (public.has_settings_permission('client_view_credit_card')
            and public.has_settings_permission('acct_add_modify_payments')) then
      raise exception 'You do not have permission to change stored payment details'
        using errcode = '42501';
    end if;
  end if;

  if current_user in ('authenticated', 'anon')
     and (new.balance_outstanding_cents, new.balance_prepay_cents,
          new.balance_credits_cents)
         is distinct from
         (old.balance_outstanding_cents, old.balance_prepay_cents,
          old.balance_credits_cents) then
    if not (public.has_settings_permission('client_view_balance')
            and public.has_settings_permission('acct_add_modify_credits')) then
      raise exception 'You do not have permission to change client balances'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- ── shared checks ────────────────────────────────────────────────────────────

-- Raises unless the caller may merge p_merge into p_keep. Does not lock.
create or replace function public._crm_merge_clients_check(p_keep uuid, p_merge uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
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
end;
$$;

-- Rows referencing p_client, per table — every foreign key to clients plus the
-- un-keyed references (notifications, campaign audiences, sub-accounts, referrals).
create or replace function public._crm_client_reference_counts(p_client uuid, p_exclude uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_n bigint;
  v_counts jsonb := '{}'::jsonb;
begin
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
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using p_client;
    if v_n > 0 then
      v_counts := jsonb_set(v_counts, array[r.tbl], to_jsonb(coalesce((v_counts ->> r.tbl)::bigint, 0) + v_n));
    end if;
  end loop;

  select count(*) into v_n from public.notifications where entity_type = 'client' and entity_id = p_client;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('notifications', v_n); end if;

  select count(*) into v_n from public.crm_campaigns where p_client = any (audience_client_ids);
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('crm_campaigns', v_n); end if;

  select count(*) into v_n from public.clients
   where parent_client_id = p_client and id is distinct from p_exclude;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('sub_accounts', v_n); end if;

  select count(*) into v_n from public.clients
   where referred_by_client_id = p_client and id is distinct from p_exclude;
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('referrals', v_n); end if;

  return v_counts;
end;
$$;

revoke all on function public._crm_merge_clients_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public._crm_client_reference_counts(uuid, uuid) from public, anon, authenticated;

-- ── preview ──────────────────────────────────────────────────────────────────

create or replace function public.crm_merge_clients_preview(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._crm_merge_clients_check(p_keep, p_merge);
  return jsonb_build_object('moved', public._crm_client_reference_counts(p_merge, p_keep));
end;
$$;

revoke all on function public.crm_merge_clients_preview(uuid, uuid) from public, anon;
grant execute on function public.crm_merge_clients_preview(uuid, uuid) to authenticated;

-- ── merge ────────────────────────────────────────────────────────────────────

create or replace function public.crm_merge_clients(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
         autopay_enabled = false,
         stripe_customer_id = case when v_move_card then null else stripe_customer_id end,
         saved_payment_method_id = case when v_move_card then null else saved_payment_method_id end,
         saved_payment_method_type = case when v_move_card then null else saved_payment_method_type end,
         saved_payment_method_summary = case when v_move_card then null else saved_payment_method_summary end,
         qbo_customer_id = case when v_move_qbo then null else qbo_customer_id end
   where id = p_merge;

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
$$;

revoke all on function public.crm_merge_clients(uuid, uuid) from public, anon;
grant execute on function public.crm_merge_clients(uuid, uuid) to authenticated;
