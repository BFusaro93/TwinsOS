-- crm_run_report: joins, client custom fields and multi-level sort.
--
-- Three additive capabilities on top of the live function (body of
-- 20261130000700_crm_run_report_bare_date_org_tz.sql plus these edits):
--
--  1. JOINS. p_joins = [{"alias":"client"}, …] adds LEFT JOINs to related report
--     views. Only relations in the catalog below are allowed (the dataset, the
--     alias, and both join columns are fixed here — nothing about a join is taken
--     from the caller except which catalog alias to switch on). A column of a joined
--     view is referenced as "<alias>.<column>" everywhere a column key is accepted
--     (select, filter, group, aggregate, sort) and comes back under that same key.
--  2. CUSTOM FIELDS. A column key "cf:<custom-field-def-uuid>" reads that client
--     custom field's value for the row's client (rpt_clients: its own id; every
--     other dataset that has a client_id column — invoices, payments, jobs, estimates, contracts). Number fields come back numeric (so they
--     sum/average), text fields as text.
--  3. MULTI-LEVEL SORT. p_sorts = [{"column":…, "dir":"asc|desc"}, …]. p_sort_column /
--     p_sort_dir keep working when p_sorts is null.
--
-- All identifiers are %I / %L quoted; every column is checked against
-- information_schema for the dataset it belongs to. The function is SECURITY INVOKER
-- (the views are security_invoker too), so RLS still scopes every caller to its org.

-- ───────────────────────────── column resolver ─────────────────────────────
create or replace function public.rpt_resolve_column(p_dataset text, p_key text, p_joins jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  -- dataset → alias → { related dataset, join columns }. Keep in step with
  -- REPORT_RELATIONS in src/lib/reports/datasets.ts.
  v_relations constant jsonb := '{
    "rpt_invoices":            {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_payments":            {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_jobs":                {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_estimates":           {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_contracts":           {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_invoice_line_items":  {"invoice":  {"dataset":"rpt_invoices",  "left":"invoice_number",  "right":"invoice_number"}},
    "rpt_estimate_line_items": {"estimate": {"dataset":"rpt_estimates", "left":"estimate_number", "right":"estimate_number"}}
  }'::jsonb;
  v_alias text;
  v_col text;
  v_rel jsonb;
  v_target text;
  v_type text;
  v_def_type text;
  v_key_col text;
  v_uuid uuid;
begin
  if p_key is null or p_key = '' then
    raise exception 'Empty column key';
  end if;

  -- client custom field
  if p_key like 'cf:%' then
    if p_key !~ '^cf:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Invalid custom field: %', p_key;
    end if;
    v_uuid := substr(p_key, 4)::uuid;
    select field_type into v_def_type from crm_custom_field_defs where id = v_uuid and deleted_at is null;
    if v_def_type is null then
      raise exception 'Unknown custom field: %', p_key;
    end if;
    v_key_col := case when p_dataset = 'rpt_clients' then 'id' else 'client_id' end;
    perform 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_dataset and column_name = v_key_col;
    if not found then
      raise exception 'Client custom fields are not available on dataset %', p_dataset;
    end if;
    if v_def_type = 'number' then
      return jsonb_build_object(
        'expr', format('(select v.value_number from crm_client_custom_field_values v where v.client_id = b.%I and v.field_def_id = %L::uuid limit 1)', v_key_col, v_uuid::text),
        'type', 'numeric');
    end if;
    return jsonb_build_object(
      'expr', format('(select v.value_text from crm_client_custom_field_values v where v.client_id = b.%I and v.field_def_id = %L::uuid limit 1)', v_key_col, v_uuid::text),
      'type', 'text');
  end if;

  -- column of a joined view: "<alias>.<column>"
  if position('.' in p_key) > 0 then
    v_alias := split_part(p_key, '.', 1);
    v_col := substr(p_key, position('.' in p_key) + 1);
    v_rel := v_relations -> p_dataset -> v_alias;
    if v_rel is null then
      raise exception 'Unknown relation % on dataset %', v_alias, p_dataset;
    end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(p_joins, '[]'::jsonb)) j where j->>'alias' = v_alias
    ) then
      raise exception 'Relation % is not joined in this query', v_alias;
    end if;
    v_target := v_rel->>'dataset';
    select data_type into v_type from information_schema.columns
      where table_schema = 'public' and table_name = v_target and column_name = v_col;
    if v_type is null then
      raise exception 'Unknown column % on %', v_col, v_target;
    end if;
    return jsonb_build_object('expr', format('%I.%I', v_alias, v_col), 'type', v_type);
  end if;

  -- plain column of the base dataset
  select data_type into v_type from information_schema.columns
    where table_schema = 'public' and table_name = p_dataset and column_name = p_key;
  if v_type is null then
    raise exception 'Unknown column % on dataset %', p_key, p_dataset;
  end if;
  return jsonb_build_object('expr', format('b.%I', p_key), 'type', v_type);
end;
$function$;

revoke all on function public.rpt_resolve_column(text, text, jsonb) from public, anon;
grant execute on function public.rpt_resolve_column(text, text, jsonb) to authenticated, service_role;

-- ───────────────────────────── main function ─────────────────────────────
-- Replace, don't overload: the old 8-argument signature goes away so a call with
-- named arguments can never be ambiguous between two versions.
drop function if exists public.crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer);

create or replace function public.crm_run_report(
  p_dataset text,
  p_columns text[],
  p_filters jsonb default '[]'::jsonb,
  p_group_by text[] default null::text[],
  p_aggregates jsonb default '[]'::jsonb,
  p_sort_column text default null::text,
  p_sort_dir text default 'asc'::text,
  p_limit integer default 1000,
  p_joins jsonb default '[]'::jsonb,
  p_sorts jsonb default null::jsonb
)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
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
  -- same catalog as rpt_resolve_column (joins are validated there per column,
  -- here the alias is turned into the actual JOIN clause)
  v_relations constant jsonb := '{
    "rpt_invoices":            {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_payments":            {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_jobs":                {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_estimates":           {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_contracts":           {"client":   {"dataset":"rpt_clients",   "left":"client_id",   "right":"id"}},
    "rpt_invoice_line_items":  {"invoice":  {"dataset":"rpt_invoices",  "left":"invoice_number",  "right":"invoice_number"}},
    "rpt_estimate_line_items": {"estimate": {"dataset":"rpt_estimates", "left":"estimate_number", "right":"estimate_number"}}
  }'::jsonb;
  -- the caller's org operating timezone (organizations.timezone; falls back
  -- to America/New_York inside org_timezone())
  v_tz constant text := coalesce(public.my_timezone(), 'America/New_York');
  v_col text;
  v_col_type text;
  v_expr text;
  v_resolved jsonb;
  v_select_parts text[] := '{}';
  v_output_cols text[] := '{}';
  v_where_parts text[] := '{}';
  v_group_parts text[] := '{}';
  v_join_parts text[] := '{}';
  v_joined text[] := '{}';
  v_order_parts text[] := '{}';
  v_filter jsonb;
  v_agg jsonb;
  v_join jsonb;
  v_rel jsonb;
  v_sort jsonb;
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
  if p_dataset is null or not (p_dataset = any(v_allowed_datasets)) then
    raise exception 'Unknown dataset: %', coalesce(p_dataset, '(null)');
  end if;

  -- joins: only catalog relations of this dataset, each at most once
  for v_join in select * from jsonb_array_elements(coalesce(p_joins, '[]'::jsonb)) loop
    v_alias := v_join->>'alias';
    v_rel := v_relations -> p_dataset -> v_alias;
    if v_alias is null or v_rel is null then
      raise exception 'Unknown relation % on dataset %', coalesce(v_alias, '(null)'), p_dataset;
    end if;
    if v_alias = any(v_joined) then
      raise exception 'Relation % joined twice', v_alias;
    end if;
    v_joined := v_joined || v_alias;
    v_join_parts := v_join_parts || format(
      'left join %I %I on b.%I = %I.%I',
      v_rel->>'dataset', v_alias, v_rel->>'left', v_alias, v_rel->>'right');
  end loop;

  if (p_group_by is not null and array_length(p_group_by, 1) > 0)
     or jsonb_array_length(coalesce(p_aggregates, '[]'::jsonb)) > 0 then
    foreach v_col in array coalesce(p_group_by, '{}') loop
      v_resolved := public.rpt_resolve_column(p_dataset, v_col, p_joins);
      v_expr := v_resolved->>'expr';
      v_select_parts := v_select_parts || format('%s as %I', v_expr, v_col);
      v_group_parts := v_group_parts || v_expr;
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
        v_resolved := public.rpt_resolve_column(p_dataset, v_col, p_joins);
        v_alias := v_fn || '_' || v_col;
        v_select_parts := v_select_parts || format('%s(%s) as %I', v_fn, v_resolved->>'expr', v_alias);
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
      v_resolved := public.rpt_resolve_column(p_dataset, v_col, p_joins);
      v_select_parts := v_select_parts || format('%s as %I', v_resolved->>'expr', v_col);
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
    v_resolved := public.rpt_resolve_column(p_dataset, v_col, p_joins);
    v_expr := v_resolved->>'expr';
    v_col_type := v_resolved->>'type';
    v_val := v_filter->>'value';

    if v_op = 'is_null' then
      v_where_parts := v_where_parts || format('%s is null', v_expr);
    elsif v_op = 'not_null' then
      v_where_parts := v_where_parts || format('%s is not null', v_expr);
    elsif v_op = 'contains' then
      -- escape LIKE metacharacters in the user's text so % _ \ match literally
      v_val := replace(replace(replace(coalesce(v_val, ''), '\', '\\'), '%', '\%'), '_', '\_');
      v_where_parts := v_where_parts || format('%s::text ilike %L', v_expr, '%' || v_val || '%');
    elsif v_op = 'in' then
      if jsonb_typeof(v_filter->'value') = 'array' then
        v_where_parts := v_where_parts || format(
          '%s::text = any(array(select jsonb_array_elements_text(%L::jsonb)))',
          v_expr, (v_filter->'value')::text);
      else
        v_where_parts := v_where_parts || format('%s::text = %L', v_expr, v_val);
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
          '%s(%s >= (%L::timestamp at time zone %L) and %s < ((%L::date + 1)::timestamp at time zone %L))',
          case when v_op = 'neq' then 'not ' else '' end,
          v_expr, v_val, v_tz, v_expr, v_val, v_tz);
      elsif v_val ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_op in ('lte', 'gt') then
        -- "through" / "after" a bare date means through / after the END of that org-local day
        v_where_parts := v_where_parts || format(
          '%s %s ((%L::date + 1)::timestamp at time zone %L)',
          v_expr, case v_op when 'lte' then '<' else '>=' end, v_val, v_tz);
      else
        v_rhs := format('(%L::timestamp at time zone %L)', v_val, v_tz);
        v_where_parts := v_where_parts || format(
          '%s %s %s',
          v_expr,
          case v_op
            when 'eq' then '=' when 'neq' then '<>'
            when 'gt' then '>' when 'gte' then '>='
            when 'lt' then '<' when 'lte' then '<=' end,
          v_rhs);
      end if;
    else
      v_where_parts := v_where_parts || format(
        '%s %s %L::%s',
        v_expr,
        case v_op
          when 'eq' then '=' when 'neq' then '<>'
          when 'gt' then '>' when 'gte' then '>='
          when 'lt' then '<' when 'lte' then '<=' end,
        v_val,
        v_col_type);
    end if;
  end loop;

  v_limit := least(greatest(coalesce(p_limit, 1000), 1), 5000);

  v_sql := format('select %s from %I b', array_to_string(v_select_parts, ', '), p_dataset);
  if array_length(v_join_parts, 1) is not null then
    v_sql := v_sql || ' ' || array_to_string(v_join_parts, ' ');
  end if;
  if array_length(v_where_parts, 1) is not null then
    v_sql := v_sql || ' where ' || array_to_string(v_where_parts, ' and ');
  end if;
  if array_length(v_group_parts, 1) is not null then
    v_sql := v_sql || ' group by ' || array_to_string(v_group_parts, ', ');
  end if;

  -- total rows matched before the limit (for grouped queries: number of groups)
  execute format('select count(*) from (%s) t', v_sql) into v_total;

  -- sort: only by columns present in the output. p_sorts (multi-level) wins over
  -- the single p_sort_column.
  if p_sorts is not null and jsonb_typeof(p_sorts) = 'array' and jsonb_array_length(p_sorts) > 0 then
    for v_sort in select * from jsonb_array_elements(p_sorts) loop
      v_col := v_sort->>'column';
      if v_col is not null and v_col = any(v_output_cols) then
        v_sort_dir := case when lower(coalesce(v_sort->>'dir', 'asc')) = 'desc' then 'desc' else 'asc' end;
        v_order_parts := v_order_parts || format('%I %s nulls last', v_col, v_sort_dir);
      end if;
    end loop;
  elsif p_sort_column is not null and p_sort_column = any(v_output_cols) then
    v_sort_dir := case when lower(coalesce(p_sort_dir, 'asc')) = 'desc' then 'desc' else 'asc' end;
    v_order_parts := v_order_parts || format('%I %s nulls last', p_sort_column, v_sort_dir);
  end if;
  if array_length(v_order_parts, 1) is not null then
    v_sql := v_sql || ' order by ' || array_to_string(v_order_parts, ', ');
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

revoke all on function public.crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer, jsonb, jsonb) from public, anon;
grant execute on function public.crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer, jsonb, jsonb) to authenticated, service_role;
