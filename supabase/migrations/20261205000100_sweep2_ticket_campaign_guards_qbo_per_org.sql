-- Landscapt sweep 2026-11-01, round 2: database guards and QuickBooks per-org ids.
--
-- 1. crm_tickets: any CRM login could soft-delete, restore, reassign or close any ticket by
--    writing the table directly (the UI hid the buttons; the UPDATE policy only checked
--    has_crm_access). Updates now need tickets_view_modify, except a crew login editing a
--    ticket it created (field upsell suggestions) and sessionless callers (service role,
--    cron, webhooks, /api/v1). Admins pass via has_settings_permission.
create or replace function public.enforce_ticket_update_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
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
$$;

drop trigger if exists trg_crm_tickets_enforce_update on public.crm_tickets;
create trigger trg_crm_tickets_enforce_update
  before update on public.crm_tickets
  for each row execute function public.enforce_ticket_update_permission();

-- 2. crm_campaigns: campaign_send was enforced only on "Send Now" (the API route). Marking a
--    campaign scheduled is a plain table update, and the hourly cron then blasts it under the
--    service role. Arming (status -> scheduled/sending, or moving scheduled_at while scheduled)
--    needs campaign_send; any other change needs campaign_edit; soft delete needs
--    campaign_delete. Sessionless callers (cron, send route's claim) and admins are exempt.
create or replace function public.enforce_campaign_update_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
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
$$;

drop trigger if exists trg_crm_campaigns_enforce_update on public.crm_campaigns;
create trigger trg_crm_campaigns_enforce_update
  before update on public.crm_campaigns
  for each row execute function public.enforce_campaign_update_permission();

-- 3. The seeded Accounting role holds accounting_settings but not company_settings /
--    crm_settings, so every save on Settings > Accounting (tax rate, ACH, card fee) was
--    refused by the organizations UPDATE policy. Same precedent as set_next_invoice_number.
drop policy if exists "settings_permission_update_org" on public.organizations;
create policy "settings_permission_update_org" on public.organizations
  for update
  using (
    id = public.my_org_id()
    and (public.has_settings_permission('company_settings')
         or public.has_settings_permission('crm_settings')
         or public.has_settings_permission('accounting_settings'))
  );

-- 4. Services: the UI gates Add/Edit/Delete on service_add / service_edit / service_delete,
--    the policies required scheduling_settings. Accept either key.
drop policy if exists "settings_permission_write_crm_services" on public.crm_services;
create policy "settings_permission_write_crm_services" on public.crm_services
  for insert
  with check (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_add')));
drop policy if exists "settings_permission_update_crm_services" on public.crm_services;
create policy "settings_permission_update_crm_services" on public.crm_services
  for update
  using (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')));
drop policy if exists "settings_permission_delete_crm_services" on public.crm_services;
create policy "settings_permission_delete_crm_services" on public.crm_services
  for delete
  using (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_delete')));

-- 5. QuickBooks ids are small per-company integers, but the unique indexes were global: the
--    second connected org's invoice collided with the first org's id, the link was silently
--    dropped and the cron re-created the invoice in QuickBooks every run. Scope them per org.
drop index if exists public.crm_invoices_qbo_invoice_id_idx;
create unique index if not exists crm_invoices_org_qbo_invoice_id_idx
  on public.crm_invoices (org_id, qbo_invoice_id) where qbo_invoice_id is not null;
drop index if exists public.crm_services_qbo_item_id_idx;
create unique index if not exists crm_services_org_qbo_item_id_idx
  on public.crm_services (org_id, qbo_item_id) where qbo_item_id is not null;
drop index if exists public.crm_qbo_pending_voids_qbo_payment_id_idx;
create unique index if not exists crm_qbo_pending_voids_org_qbo_payment_id_idx
  on public.crm_qbo_pending_voids (org_id, qbo_payment_id);

-- crm_payment_allocations has no org_id column; its qbo_payment_id index stays as is (a
-- collision there only blocks the second org's payment push, which recordSyncResult reports).

-- 6. crm_run_report was executable by any authenticated login with no permission check; the
--    Report Center keys were enforced only in the API routes. Crew logins keep their path
--    (crew dashboards run through the same RPC under the crew session).

CREATE OR REPLACE FUNCTION public.crm_run_report(p_dataset text, p_columns text[], p_filters jsonb DEFAULT '[]'::jsonb, p_group_by text[] DEFAULT NULL::text[], p_aggregates jsonb DEFAULT '[]'::jsonb, p_sort_column text DEFAULT NULL::text, p_sort_dir text DEFAULT 'asc'::text, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_allowed_datasets constant text[] := array[
    'rpt_clients', 'rpt_client_contacts', 'rpt_client_activity',
    'rpt_jobs', 'rpt_job_visits', 'rpt_job_services',
    'rpt_invoices', 'rpt_invoice_line_items', 'rpt_payments',
    'rpt_estimates', 'rpt_estimate_line_items', 'rpt_contracts',
    'rpt_timesheets', 'rpt_employees', 'rpt_services',
    'rpt_vendors', 'rpt_products', 'rpt_chemical_applications',
    'rpt_projects_wip', 'rpt_sales_rep_month', 'rpt_contract_service_usage',
    'rpt_crew_drive_time', 'rpt_upsells', 'rpt_tickets',
    'rpt_audit_log', 'rpt_address_verification'
  ];
  v_allowed_ops constant text[] := array['eq','neq','gt','gte','lt','lte','contains','in','is_null','not_null'];
  v_allowed_fns constant text[] := array['sum','avg','min','max','count'];
  -- the caller's org operating timezone (organizations.timezone; falls back
  -- to America/New_York inside org_timezone())
  v_tz constant text := coalesce(public.my_timezone(), 'America/New_York');
  v_col text;
  v_col_type text;
  v_select_parts text[] := '{}';
  v_output_cols text[] := '{}';
  v_where_parts text[] := '{}';
  v_group_parts text[] := '{}';
  v_filter jsonb;
  v_agg jsonb;
  v_op text;
  v_fn text;
  v_alias text;
  v_val text;
  v_rhs text;
  v_sort_dir text;
  v_limit integer;
  v_sql text;
  v_result jsonb;
  v_total bigint;
begin
  if auth.uid() is not null
     and not (public.has_settings_permission('view_report_center') or public.my_role() = 'crew') then
    raise exception 'You do not have permission to run reports' using errcode = '42501';
  end if;
  if p_dataset is null or not (p_dataset = any(v_allowed_datasets)) then
    raise exception 'Unknown dataset: %', coalesce(p_dataset, '(null)');
  end if;

  if (p_group_by is not null and array_length(p_group_by, 1) > 0)
     or jsonb_array_length(coalesce(p_aggregates, '[]'::jsonb)) > 0 then
    foreach v_col in array coalesce(p_group_by, '{}') loop
      select data_type into v_col_type from information_schema.columns
        where table_schema = 'public' and table_name = p_dataset and column_name = v_col;
      if v_col_type is null then
        raise exception 'Unknown column % on dataset %', v_col, p_dataset;
      end if;
      v_select_parts := v_select_parts || format('%I', v_col);
      v_group_parts := v_group_parts || format('%I', v_col);
      v_output_cols := v_output_cols || v_col;
    end loop;

    for v_agg in select * from jsonb_array_elements(coalesce(p_aggregates, '[]'::jsonb)) loop
      v_fn := lower(v_agg->>'fn');
      v_col := v_agg->>'column';
      if v_fn is null or not (v_fn = any(v_allowed_fns)) then
        raise exception 'Unknown aggregate function: %', coalesce(v_fn, '(null)');
      end if;
      if v_col = '*' then
        if v_fn <> 'count' then
          raise exception 'Only count may aggregate *';
        end if;
        v_alias := 'count_all';
        v_select_parts := v_select_parts || format('count(*) as %I', v_alias);
      else
        select data_type into v_col_type from information_schema.columns
          where table_schema = 'public' and table_name = p_dataset and column_name = v_col;
        if v_col_type is null then
          raise exception 'Unknown column % on dataset %', v_col, p_dataset;
        end if;
        v_alias := v_fn || '_' || v_col;
        v_select_parts := v_select_parts || format('%s(%I) as %I', v_fn, v_col, v_alias);
      end if;
      v_output_cols := v_output_cols || v_alias;
    end loop;

    if array_length(v_select_parts, 1) is null then
      raise exception 'Grouped query requires at least one group column or aggregate';
    end if;
  else
    if p_columns is null or array_length(p_columns, 1) is null then
      raise exception 'At least one column is required';
    end if;
    foreach v_col in array p_columns loop
      select data_type into v_col_type from information_schema.columns
        where table_schema = 'public' and table_name = p_dataset and column_name = v_col;
      if v_col_type is null then
        raise exception 'Unknown column % on dataset %', v_col, p_dataset;
      end if;
      v_select_parts := v_select_parts || format('%I', v_col);
      v_output_cols := v_output_cols || v_col;
    end loop;
  end if;

  -- filters
  for v_filter in select * from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) loop
    v_col := v_filter->>'column';
    v_op := lower(v_filter->>'op');
    if v_op is null or not (v_op = any(v_allowed_ops)) then
      raise exception 'Unknown filter op: %', coalesce(v_op, '(null)');
    end if;
    select data_type into v_col_type from information_schema.columns
      where table_schema = 'public' and table_name = p_dataset and column_name = v_col;
    if v_col_type is null then
      raise exception 'Unknown column % on dataset %', v_col, p_dataset;
    end if;
    v_val := v_filter->>'value';

    if v_op = 'is_null' then
      v_where_parts := v_where_parts || format('%I is null', v_col);
    elsif v_op = 'not_null' then
      v_where_parts := v_where_parts || format('%I is not null', v_col);
    elsif v_op = 'contains' then
      -- escape LIKE metacharacters in the user's text so % _ \ match literally
      v_val := replace(replace(replace(coalesce(v_val, ''), '\', '\\'), '%', '\%'), '_', '\_');
      v_where_parts := v_where_parts || format('%I::text ilike %L', v_col, '%' || v_val || '%');
    elsif v_op = 'in' then
      if jsonb_typeof(v_filter->'value') = 'array' then
        v_where_parts := v_where_parts || format(
          '%I::text = any(array(select jsonb_array_elements_text(%L::jsonb)))',
          v_col, (v_filter->'value')::text);
      else
        v_where_parts := v_where_parts || format('%I::text = %L', v_col, v_val);
      end if;
    elsif v_col_type = 'timestamp with time zone'
          and v_val is not null
          and v_val !~ '[Zz]$'
          and v_val !~ '[T ][0-9:.]+[+-][0-9]{2}(:?[0-9]{2})?$' then
      -- Bare (offset-less) literal on a timestamptz column: interpret it in the
      -- org's operating timezone rather than the UTC session timezone.
      if v_val ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_op in ('eq', 'neq') then
        -- whole org-local day
        v_where_parts := v_where_parts || format(
          '%s(%I >= (%L::timestamp at time zone %L) and %I < ((%L::date + 1)::timestamp at time zone %L))',
          case when v_op = 'neq' then 'not ' else '' end,
          v_col, v_val, v_tz, v_col, v_val, v_tz);
      elsif v_val ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_op in ('lte', 'gt') then
        -- "through" / "after" a bare date means through / after the END of that org-local day
        v_where_parts := v_where_parts || format(
          '%I %s ((%L::date + 1)::timestamp at time zone %L)',
          v_col, case v_op when 'lte' then '<' else '>=' end, v_val, v_tz);
      else
        v_rhs := format('(%L::timestamp at time zone %L)', v_val, v_tz);
        v_where_parts := v_where_parts || format(
          '%I %s %s',
          v_col,
          case v_op
            when 'eq' then '=' when 'neq' then '<>'
            when 'gt' then '>' when 'gte' then '>='
            when 'lt' then '<' when 'lte' then '<=' end,
          v_rhs);
      end if;
    else
      v_where_parts := v_where_parts || format(
        '%I %s %L::%s',
        v_col,
        case v_op
          when 'eq' then '=' when 'neq' then '<>'
          when 'gt' then '>' when 'gte' then '>='
          when 'lt' then '<' when 'lte' then '<=' end,
        v_val,
        v_col_type);
    end if;
  end loop;

  -- sort: only by a column present in the output
  v_sort_dir := case when lower(coalesce(p_sort_dir, 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_limit := least(greatest(coalesce(p_limit, 1000), 1), 5000);

  v_sql := format('select %s from %I', array_to_string(v_select_parts, ', '), p_dataset);
  if array_length(v_where_parts, 1) is not null then
    v_sql := v_sql || ' where ' || array_to_string(v_where_parts, ' and ');
  end if;
  if array_length(v_group_parts, 1) is not null then
    v_sql := v_sql || ' group by ' || array_to_string(v_group_parts, ', ');
  end if;

  -- total rows matched before the limit (for grouped queries: number of groups)
  execute format('select count(*) from (%s) t', v_sql) into v_total;

  if p_sort_column is not null and p_sort_column = any(v_output_cols) then
    v_sql := v_sql || format(' order by %I %s nulls last', p_sort_column, v_sort_dir);
  end if;
  v_sql := v_sql || format(' limit %s', v_limit);

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s) t', v_sql
  ) into v_result;

  return jsonb_build_object(
    'rows', v_result,
    'row_count', jsonb_array_length(v_result),
    'total_count', v_total
  );
end;
$function$;

-- 7. Editing a payment re-creates its allocations: keep each surviving invoice's QuickBooks
--    payment id (body is 20261111020000 plus the carry-over).
CREATE OR REPLACE FUNCTION public.crm_update_payment(p_payment_id uuid, p_client_id uuid, p_amount_cents integer, p_payment_date date, p_method text, p_reference text, p_memo text, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_cur        record;
  v_refunded   integer;
  v_alloc      record;
  v_old        record;
  v_inv        record;
  v_prior      integer;
  v_cap        integer;
  v_amt        integer;
  v_resolved   jsonb := '[]'::jsonb;
  v_allocated  integer := 0;
  v_count      integer := 0;
  v_primary    uuid := null;
  v_legacy     integer;
  v_elem       jsonb;
begin
  if not public._acct_permitted(case when coalesce((select is_credit from public.crm_payments where id = p_payment_id), false) then array['acct_add_modify_credits'] else array['acct_add_modify_payments'] end) then
    raise exception 'You do not have permission to edit a payment or credit' using errcode = '42501';
  end if;
  select invoice_id, amount_cents, coalesce(refunded_amount_cents, 0) as refunded_amount_cents,
         coalesce(unused_amount_cents, 0) as unused_amount_cents, stripe_payment_intent_id
    into v_cur
    from crm_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  v_refunded := v_cur.refunded_amount_cents;

  if v_cur.stripe_payment_intent_id is not null and p_amount_cents is distinct from v_cur.amount_cents then
    raise exception 'This payment was made online — its amount can''t be changed. Issue a refund instead.';
  end if;
  if p_amount_cents < v_refunded then
    raise exception 'The payment amount can''t be less than what has already been refunded';
  end if;

  perform 1 from crm_invoices
    where id in (
      select invoice_id from crm_payment_allocations where payment_id = p_payment_id
      union
      select (e->>'invoice_id')::uuid from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
      union
      select v_cur.invoice_id where v_cur.invoice_id is not null
    )
    order by id for update;

  for v_alloc in
    select (e->>'invoice_id')::uuid as invoice_id, (e->>'amount_cents')::integer as amount_cents
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
  loop
    if v_alloc.amount_cents is null or v_alloc.amount_cents <= 0 then
      continue;
    end if;
    select id, invoice_number, status, coalesce(balance_cents, 0) as balance_cents
      into v_inv from crm_invoices where id = v_alloc.invoice_id;
    if not found then
      raise exception 'One of the selected invoices no longer exists';
    end if;
    if v_inv.status in ('draft', 'void') then
      raise exception 'Invoice #% is % — payments can only be applied to issued invoices',
        coalesce(v_inv.invoice_number::text, '—'), v_inv.status;
    end if;
    select coalesce(sum(amount_cents), 0) into v_prior
      from crm_payment_allocations where payment_id = p_payment_id and invoice_id = v_alloc.invoice_id;
    v_cap := greatest(0, v_inv.balance_cents + v_prior);
    v_amt := least(v_alloc.amount_cents, v_cap);
    if v_amt > 0 then
      v_resolved := v_resolved || jsonb_build_object('invoice_id', v_alloc.invoice_id, 'amount_cents', v_amt);
      v_allocated := v_allocated + v_amt;
      v_count := v_count + 1;
      v_primary := v_alloc.invoice_id;
    end if;
  end loop;
  if v_count <> 1 then
    v_primary := null;
  end if;

  if v_allocated > p_amount_cents - v_refunded then
    if v_refunded > 0 then
      raise exception 'Allocated amount exceeds what''s left of this payment after refunds';
    else
      raise exception 'Allocated amount exceeds the payment amount';
    end if;
  end if;

  if exists (select 1 from crm_payment_allocations where payment_id = p_payment_id) then
    for v_old in
      select invoice_id, amount_cents from crm_payment_allocations where payment_id = p_payment_id
    loop
      perform apply_payment_to_invoice(v_old.invoice_id, -v_old.amount_cents);
    end loop;
  elsif v_cur.invoice_id is not null then
    v_legacy := greatest(0, v_cur.amount_cents - v_refunded - v_cur.unused_amount_cents);
    if v_legacy > 0 then
      perform apply_payment_to_invoice(v_cur.invoice_id, -v_legacy);
    end if;
  end if;

  update crm_payments set
    invoice_id          = v_primary,
    amount_cents        = p_amount_cents,
    unused_amount_cents = greatest(0, p_amount_cents - v_refunded - v_allocated),
    payment_date        = p_payment_date,
    method              = p_method,
    reference           = p_reference,
    memo                = p_memo
  where id = p_payment_id;

  -- Re-inserting the allocations used to drop their QuickBooks payment ids, so the sync cron
  -- pushed the same payment a second time. Carry the id over for every invoice that keeps an
  -- allocation; a removed invoice's QuickBooks payment is voided by the caller.
  create temp table if not exists _upd_pay_qbo (invoice_id uuid, qbo_payment_id text, qbo_sync_error text, qbo_sync_attempted_at timestamptz) on commit drop;
  delete from _upd_pay_qbo;
  insert into _upd_pay_qbo
    select invoice_id, qbo_payment_id, qbo_sync_error, qbo_sync_attempted_at
    from crm_payment_allocations
    where payment_id = p_payment_id and qbo_payment_id is not null;
  delete from crm_payment_allocations where payment_id = p_payment_id;
  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    insert into crm_payment_allocations (payment_id, invoice_id, amount_cents, qbo_payment_id, qbo_sync_error, qbo_sync_attempted_at)
    select p_payment_id, (v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer,
           q.qbo_payment_id, q.qbo_sync_error, q.qbo_sync_attempted_at
    from (select 1) _x
    left join _upd_pay_qbo q on q.invoice_id = (v_elem->>'invoice_id')::uuid;
  end loop;

  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    perform apply_payment_to_invoice((v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer);
  end loop;

  perform sync_client_balance(p_client_id);

  return jsonb_build_object('payment_id', p_payment_id);
end;
$function$;
