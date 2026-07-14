-- CRM Report Center: reporting views, safe dynamic-report RPC, saved custom reports.
--
-- Views use security_invoker so RLS on the underlying tables applies to the
-- querying user — org scoping is inherited, never bypassed.

-- ============================================================
-- 0. Column guards
-- ============================================================
-- Some environments (test) are missing columns that were added to prod
-- directly. The views below depend on these; add them idempotently.

alter table crm_job_visits
  add column if not exists actual_labor_cost_cents integer,
  add column if not exists budgeted_hours numeric;

alter table clients
  add column if not exists cancellation_reason text,
  add column if not exists closed_at timestamptz;

alter table crm_crew_members
  add column if not exists labor_burden_cents_per_hour integer;

alter table crm_services
  add column if not exists target_rate_cents_per_hr            integer not null default 0,
  add column if not exists target_rate_with_drive_cents_per_hr integer not null default 0;

alter table crm_employees
  add column if not exists labor_burden_cents_per_hour integer not null default 0;

alter table crm_jobs
  add column if not exists job_number serial;

-- ============================================================
-- 1. Reporting views (datasets)
-- ============================================================

create or replace view rpt_clients
with (security_invoker = on) as
select
  c.id,
  c.display_name,
  c.first_name,
  c.account_type,
  c.status,
  c.source,
  c.referred_by,
  c.client_since,
  c.cancellation_reason,
  c.closed_at,
  c.primary_email,
  c.primary_phone,
  c.billing_address,
  c.billing_city,
  c.billing_state,
  c.billing_zip,
  c.invoice_frequency,
  coalesce(c.default_payment_method, c.payment_method) as payment_method,
  c.billing_terms,
  c.is_taxable,
  sr.name as sales_rep,
  c.balance_outstanding_cents,
  c.balance_credits_cents,
  c.balance_prepay_cents,
  c.balance_uninvoiced_cents,
  c.turf_sqft,
  c.gross_sqft,
  c.map_code,
  c.created_at
from clients c
left join profiles sr on sr.id = c.sales_rep_id
where c.deleted_at is null;

create or replace view rpt_client_contacts
with (security_invoker = on) as
select
  ct.id,
  c.display_name as client_name,
  c.status as client_status,
  ct.first_name,
  ct.last_name,
  ct.contact_type,
  ct.phone,
  ct.phone_type,
  ct.email,
  ct.is_primary,
  ct.ok_to_email,
  sr.name as sales_rep,
  c.balance_outstanding_cents,
  ct.created_at
from client_contacts ct
join clients c on c.id = ct.client_id and c.deleted_at is null
left join profiles sr on sr.id = c.sales_rep_id
where ct.deleted_at is null;

create or replace view rpt_client_activity
with (security_invoker = on) as
select
  a.id,
  a.occurred_at,
  a.activity_type,
  c.display_name as client_name,
  c.status as client_status,
  a.subject,
  a.body,
  a.amount_cents,
  a.status,
  a.sent_to,
  a.created_at
from client_activity a
join clients c on c.id = a.client_id and c.deleted_at is null;

create or replace view rpt_jobs
with (security_invoker = on) as
select
  j.id,
  j.job_number,
  c.display_name as client_name,
  j.job_type,
  j.status,
  j.sub_status,
  j.scheduled_date,
  j.date_sold,
  j.source,
  j.sales_rep,
  cw.name as crew_name,
  (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id) as service_names,
  j.man_count,
  j.rate_cents,
  j.budgeted_hours,
  j.actual_hours,
  j.service_total_cents,
  j.product_total_cents,
  j.tax_cents,
  j.total_cents,
  j.service_address,
  j.service_city,
  j.service_zip,
  j.package_name,
  (j.contract_id is not null) as under_contract,
  j.is_complete,
  j.created_at
from crm_jobs j
join clients c on c.id = j.client_id and c.deleted_at is null
left join crm_crews cw on cw.id = j.crew_id
where j.deleted_at is null;

create or replace view rpt_job_visits
with (security_invoker = on) as
select
  v.id,
  v.scheduled_date,
  v.completed_at,
  v.status,
  v.sub_status,
  c.display_name as client_name,
  (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id) as service_names,
  cw.name as crew_name,
  j.sales_rep,
  coalesce(v.men_count, 1) as men_count,
  coalesce(v.budgeted_hours, j.budgeted_hours) as budgeted_hours,
  calc.actual_hours,
  round(calc.actual_hours * coalesce(v.men_count, 1), 2) as man_hours,
  coalesce(v.rate_cents, j.rate_cents) as rate_cents,
  calc.revenue_cents,
  v.actual_labor_cost_cents,
  case
    when calc.actual_hours * coalesce(v.men_count, 1) > 0
    then round(calc.revenue_cents / (calc.actual_hours * coalesce(v.men_count, 1)))::int
  end as rev_per_man_hr_cents,
  round(coalesce(v.budgeted_hours, j.budgeted_hours, 0) - coalesce(calc.actual_hours, 0), 2) as variance_hours,
  j.service_city,
  j.service_zip,
  v.skip_reason,
  v.clocked_in_at,
  v.clocked_out_at
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
left join crm_crews cw on cw.id = coalesce(v.crew_id, j.crew_id)
cross join lateral (
  select
    coalesce(
      v.actual_hours,
      case when v.clocked_in_at is not null and v.clocked_out_at is not null
        then round((extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0)::numeric, 2)
      end
    ) as actual_hours,
    (coalesce(v.rate_cents, j.rate_cents, 0) * coalesce(nullif(v.qty, 0), 1))::int as revenue_cents
) calc
where v.deleted_at is null;

create or replace view rpt_invoices
with (security_invoker = on) as
select
  i.id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.status,
  c.display_name as client_name,
  sr.name as sales_rep,
  i.description,
  i.subtotal_cents,
  i.discount_cents,
  i.tax_cents,
  i.total_cents,
  i.amount_paid_cents,
  i.balance_cents,
  i.terms,
  i.preferred_payment_method as payment_method,
  i.service_address,
  i.po_number,
  (i.contract_id is not null) as under_contract,
  c.billing_city,
  c.billing_zip,
  case when i.balance_cents > 0 and i.due_date is not null
    then greatest(0, current_date - i.due_date) else 0 end as days_overdue,
  i.created_at
from crm_invoices i
join clients c on c.id = i.client_id and c.deleted_at is null
left join profiles sr on sr.id = c.sales_rep_id
where i.deleted_at is null;

create or replace view rpt_invoice_line_items
with (security_invoker = on) as
select
  li.id,
  i.invoice_number,
  i.invoice_date,
  i.status as invoice_status,
  c.display_name as client_name,
  li.name,
  li.description,
  li.service_date,
  li.qty,
  li.rate_cents,
  li.total_cents,
  li.is_taxable,
  li.hours,
  li.men
from crm_invoice_line_items li
join crm_invoices i on i.id = li.invoice_id and i.deleted_at is null
join clients c on c.id = i.client_id and c.deleted_at is null;

create or replace view rpt_payments
with (security_invoker = on) as
select
  p.id,
  p.payment_date,
  c.display_name as client_name,
  p.method,
  p.reference,
  p.memo,
  p.amount_cents,
  p.unused_amount_cents,
  p.refunded_amount_cents,
  (coalesce(p.amount_cents, 0) - coalesce(p.unused_amount_cents, 0)) as applied_amount_cents,
  p.is_prepayment,
  i.invoice_number,
  c.billing_zip,
  p.created_at
from crm_payments p
join clients c on c.id = p.client_id and c.deleted_at is null
left join crm_invoices i on i.id = p.invoice_id
where p.deleted_at is null;

create or replace view rpt_estimates
with (security_invoker = on) as
select
  e.id,
  e.estimate_number,
  e.estimate_date,
  e.valid_until_date,
  e.stage,
  c.display_name as client_name,
  c.status as client_status,
  coalesce(e.source, c.source) as source,
  sr.name as sales_rep,
  e.description,
  e.subtotal_cents,
  e.discount_cents,
  e.tax_cents,
  e.total_cents,
  e.gross_profit_cents,
  e.net_profit_cents,
  e.total_budgeted_hours,
  round(coalesce(e.probability_bps, 0) / 100.0, 1) as probability_pct,
  e.reason,
  (current_date - e.estimate_date) as age_days,
  e.created_at,
  e.updated_at
from estimates e
join clients c on c.id = e.client_id and c.deleted_at is null
left join profiles sr on sr.id = e.sales_rep_id
where e.deleted_at is null;

create or replace view rpt_estimate_line_items
with (security_invoker = on) as
select
  li.id,
  e.estimate_number,
  e.estimate_date,
  e.stage as estimate_stage,
  c.display_name as client_name,
  sr.name as sales_rep,
  li.service_name,
  li.status,
  li.qty,
  li.rate_cents,
  li.visits,
  li.budgeted_hours,
  li.total_budgeted_hours,
  li.cost_cents,
  li.total_cost_cents,
  li.total_cents,
  round(coalesce(li.margin_bps, 0) / 100.0, 1) as margin_pct
from estimate_line_items li
join estimates e on e.id = li.estimate_id and e.deleted_at is null
join clients c on c.id = e.client_id and c.deleted_at is null
left join profiles sr on sr.id = e.sales_rep_id
where li.deleted_at is null
  and coalesce(li.row_type, 'line') not in ('section', 'text');

create or replace view rpt_contracts
with (security_invoker = on) as
select
  k.id,
  k.title,
  c.display_name as client_name,
  k.status,
  k.start_date,
  k.end_date,
  k.monthly_amount_cents,
  k.billing_frequency,
  k.billing_day_of_month,
  k.is_active,
  k.auto_generate,
  k.last_billed_date,
  k.sales_rep,
  k.source,
  k.created_at
from crm_contracts k
join clients c on c.id = k.client_id and c.deleted_at is null
where k.deleted_at is null;

create or replace view rpt_timesheets
with (security_invoker = on) as
select
  t.id,
  (t.clocked_in_at at time zone 'utc')::date as work_date,
  m.name as member_name,
  cw.name as crew_name,
  c.display_name as client_name,
  v.status as visit_status,
  t.clocked_in_at,
  t.clocked_out_at,
  t.break_minutes,
  t.lunch_minutes,
  calc.hours,
  m.labor_burden_cents_per_hour,
  case when calc.hours is not null and m.labor_burden_cents_per_hour is not null
    then round(calc.hours * m.labor_burden_cents_per_hour)::int
  end as labor_cost_cents
from crm_crew_member_times t
join crm_crew_members m on m.id = t.crew_member_id
left join crm_crews cw on cw.id = m.crew_id
left join crm_job_visits v on v.id = t.visit_id
left join clients c on c.id = v.client_id and c.deleted_at is null
cross join lateral (
  select case when t.clocked_out_at is not null then
    greatest(
      round(
        ((extract(epoch from (t.clocked_out_at - t.clocked_in_at)) / 3600.0)
          - coalesce(t.break_minutes, 0) / 60.0
          - coalesce(t.lunch_minutes, 0) / 60.0)::numeric, 2),
      0)
  end as hours
) calc;

create or replace view rpt_employees
with (security_invoker = on) as
select
  e.id,
  trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as full_name,
  e.first_name,
  e.last_name,
  e.email,
  e.phone,
  e.cell_phone,
  e.city,
  e.state,
  e.employment_status,
  e.compensation_type,
  e.hourly_rate_cents,
  e.user_type,
  e.resource_code,
  e.applicator_license,
  e.is_sales_rep,
  e.is_active,
  e.date_hired,
  e.emergency_contact,
  e.emergency_phone
from crm_employees e
where e.deleted_at is null;

create or replace view rpt_services
with (security_invoker = on) as
select
  s.id,
  s.name,
  s.code,
  s.category,
  s.unit,
  s.default_rate_cents,
  s.production_rate_sqft_per_hr,
  s.target_rate_cents_per_hr,
  s.target_rate_with_drive_cents_per_hr,
  s.is_taxable,
  s.is_active
from crm_services s
where s.deleted_at is null;

create or replace view rpt_vendors
with (security_invoker = on) as
select
  v.id,
  v.name,
  v.contact_name,
  v.email,
  v.phone,
  v.address,
  v.vendor_type,
  v.is_active,
  v.w9_status
from vendors v
where v.deleted_at is null;

create or replace view rpt_products
with (security_invoker = on) as
select
  p.id,
  p.name,
  p.part_number,
  p.category,
  p.part_category,
  p.unit_cost,
  p.price,
  p.vendor_name,
  p.is_inventory,
  p.quantity_on_hand,
  p.minimum_stock
from product_items p
where p.deleted_at is null;

-- ============================================================
-- 2. Saved custom reports (analyses)
-- ============================================================

create table if not exists crm_custom_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id() references organizations(id),
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table crm_custom_reports enable row level security;

drop policy if exists "crm_custom_reports_org" on crm_custom_reports;
create policy "crm_custom_reports_org" on crm_custom_reports
  for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

-- ============================================================
-- 3. Safe dynamic report RPC
-- ============================================================
-- SECURITY INVOKER: runs as the calling user, so the security_invoker views +
-- base-table RLS keep everything org-scoped. Every identifier is validated
-- against a whitelist + information_schema before being interpolated with %I,
-- and every value goes through %L with a cast to the column's real type.

create or replace function crm_run_report(
  p_dataset text,
  p_columns text[],
  p_filters jsonb default '[]'::jsonb,
  p_group_by text[] default null,
  p_aggregates jsonb default '[]'::jsonb,
  p_sort_column text default null,
  p_sort_dir text default 'asc',
  p_limit integer default 1000
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allowed_datasets constant text[] := array[
    'rpt_clients', 'rpt_client_contacts', 'rpt_client_activity',
    'rpt_jobs', 'rpt_job_visits',
    'rpt_invoices', 'rpt_invoice_line_items', 'rpt_payments',
    'rpt_estimates', 'rpt_estimate_line_items', 'rpt_contracts',
    'rpt_timesheets', 'rpt_employees', 'rpt_services',
    'rpt_vendors', 'rpt_products'
  ];
  v_allowed_ops constant text[] := array['eq','neq','gt','gte','lt','lte','contains','in','is_null','not_null'];
  v_allowed_fns constant text[] := array['sum','avg','min','max','count'];
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
  v_sort_dir text;
  v_limit integer;
  v_sql text;
  v_result jsonb;
begin
  -- dataset must be whitelisted
  if p_dataset is null or not (p_dataset = any(v_allowed_datasets)) then
    raise exception 'Unknown dataset: %', coalesce(p_dataset, '(null)');
  end if;

  -- helper: assert a column exists on the dataset view, return its type
  -- (inlined below via the same query since plpgsql lacks local functions)

  -- plain columns (no grouping) or group-by columns
  if p_group_by is not null and array_length(p_group_by, 1) > 0 then
    foreach v_col in array p_group_by loop
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

    if v_op = 'is_null' then
      v_where_parts := v_where_parts || format('%I is null', v_col);
    elsif v_op = 'not_null' then
      v_where_parts := v_where_parts || format('%I is not null', v_col);
    elsif v_op = 'contains' then
      v_where_parts := v_where_parts || format('%I::text ilike %L', v_col, '%' || (v_filter->>'value') || '%');
    elsif v_op = 'in' then
      v_where_parts := v_where_parts || format(
        '%I::text = any(array(select jsonb_array_elements_text(%L::jsonb)))',
        v_col, (v_filter->'value')::text);
    else
      v_where_parts := v_where_parts || format(
        '%I %s %L::%s',
        v_col,
        case v_op
          when 'eq' then '=' when 'neq' then '<>'
          when 'gt' then '>' when 'gte' then '>='
          when 'lt' then '<' when 'lte' then '<=' end,
        v_filter->>'value',
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
  if p_sort_column is not null and p_sort_column = any(v_output_cols) then
    v_sql := v_sql || format(' order by %I %s nulls last', p_sort_column, v_sort_dir);
  end if;
  v_sql := v_sql || format(' limit %s', v_limit);

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s) t', v_sql
  ) into v_result;

  return jsonb_build_object('rows', v_result, 'row_count', jsonb_array_length(v_result));
end;
$$;

revoke all on function crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer) from public;
grant execute on function crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer) to authenticated;
