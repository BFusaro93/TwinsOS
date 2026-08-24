-- Production-rate accuracy reporting: compares each job service's assumed
-- production rate (crm_services.production_rate_sqft_per_hr) against what
-- was actually achieved on the job (qty / actual man-hours). Built at the
-- crm_job_services grain (not crm_job_visits) because that's where qty,
-- budgeted_hours, and service_id actually live — a visit only has a single
-- actual_hours total that can cover multiple services on the same job.
--
-- Job-level actual_hours/man_count are used (not per-visit), since crm_jobs
-- rolls actual_hours up across all visits already — appropriate for a total
-- qty that also represents the whole job's scope, not one visit's share.

create or replace view rpt_job_services
with (security_invoker = on) as
select
  jsv.id,
  jsv.job_id,
  j.status as job_status,
  j.is_complete,
  j.scheduled_date,
  c.display_name as client_name,
  jsv.service_id,
  jsv.service_name,
  cs.category as service_category,
  cs.unit as service_unit,
  jsv.budget_method,
  cs.production_rate_sqft_per_hr as assumed_production_rate,
  jsv.qty,
  jsv.budgeted_hours,
  j.actual_hours as job_actual_hours,
  coalesce(j.man_count, 1) as man_count,
  round(coalesce(j.actual_hours, 0) * coalesce(j.man_count, 1), 2) as actual_man_hours,
  case
    when j.actual_hours > 0 and coalesce(j.man_count, 1) > 0
    then round(jsv.qty / (j.actual_hours * coalesce(j.man_count, 1)), 2)
  end as actual_production_rate,
  case
    when cs.production_rate_sqft_per_hr > 0 and j.actual_hours > 0 and coalesce(j.man_count, 1) > 0
    then round(
      (
        (jsv.qty / (j.actual_hours * coalesce(j.man_count, 1)) - cs.production_rate_sqft_per_hr)
        / cs.production_rate_sqft_per_hr
      ) * 10000
    )::int
  end as rate_variance_bps
from crm_job_services jsv
join crm_jobs j on j.id = jsv.job_id and j.deleted_at is null
join clients c on c.id = j.client_id and c.deleted_at is null
left join crm_services cs on cs.id = jsv.service_id;

-- Whitelist the new dataset in crm_run_report. Recreated from the exact live
-- definition on prod (confirmed via pg_get_functiondef) plus 'rpt_job_services'
-- appended — the migration file's version of this function had already
-- drifted from what's actually deployed (missing 'rpt_chemical_applications'),
-- so this is based on the real deployed text, not the old migration file.
create or replace function public.crm_run_report(
  p_dataset text,
  p_columns text[],
  p_filters jsonb default '[]'::jsonb,
  p_group_by text[] default null::text[],
  p_aggregates jsonb default '[]'::jsonb,
  p_sort_column text default null::text,
  p_sort_dir text default 'asc'::text,
  p_limit integer default 1000
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
    'rpt_vendors', 'rpt_products', 'rpt_chemical_applications'
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
  if p_dataset is null or not (p_dataset = any(v_allowed_datasets)) then
    raise exception 'Unknown dataset: %', coalesce(p_dataset, '(null)');
  end if;

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
$function$;
