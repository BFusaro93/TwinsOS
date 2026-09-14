-- crm_run_report: New York time interpretation, safer filters, total_count.
--
-- 1. Timestamp filters were evaluated in the UTC session: a bare New York date
--    ('2026-09-01') or date-time ('2026-09-03 23:59:59.999') cast with
--    ::timestamptz meant midnight UTC = 8pm ET the evening before, so every
--    datetime window was shifted 4-5 hours. Bare literals (no Z / offset) on
--    timestamptz columns are now interpreted in America/New_York; literals that
--    carry an explicit offset are used as-is. An `eq` with a bare DATE on a
--    timestamptz column now matches the whole New York day.
-- 2. `contains` escapes % _ \ in the user's text so wildcards don't leak.
-- 3. `in` accepts a scalar value as well as a JSON array.
-- 4. The result also carries `total_count` (rows matched before LIMIT) so the
--    client can flag truncated tables and totals.
--
-- Everything else (whitelisting, quoting, sort/limit rules) is unchanged from
-- the live definition of 2026-09-03.
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
    'rpt_jobs', 'rpt_job_visits', 'rpt_job_services',
    'rpt_invoices', 'rpt_invoice_line_items', 'rpt_payments',
    'rpt_estimates', 'rpt_estimate_line_items', 'rpt_contracts',
    'rpt_timesheets', 'rpt_employees', 'rpt_services',
    'rpt_vendors', 'rpt_products', 'rpt_chemical_applications',
    'rpt_projects_wip', 'rpt_sales_rep_month',
    'rpt_contract_service_usage'
  ];
  v_allowed_ops constant text[] := array['eq','neq','gt','gte','lt','lte','contains','in','is_null','not_null'];
  v_allowed_fns constant text[] := array['sum','avg','min','max','count'];
  v_tz constant text := 'America/New_York';
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
          and v_val !~ '(Z|z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
      -- Bare (offset-less) literal on a timestamptz column: interpret it in the
      -- org's operating timezone rather than the UTC session timezone.
      if v_op = 'eq' and v_val ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        -- whole New York day
        v_where_parts := v_where_parts || format(
          '(%I >= (%L::timestamp at time zone %L) and %I < ((%L::date + 1)::timestamp at time zone %L))',
          v_col, v_val, v_tz, v_col, v_val, v_tz);
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
$$;

revoke all on function crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer) from public;
grant execute on function crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer) to authenticated;
