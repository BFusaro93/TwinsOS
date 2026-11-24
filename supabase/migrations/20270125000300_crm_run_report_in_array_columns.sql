-- crm_run_report: the "in" filter op also works on array columns.
--
-- With a scalar column "in" is unchanged (column value is one of the list). With an
-- array column (information_schema data_type 'ARRAY', e.g. rpt_job_visits.service_ids)
-- it now means "overlaps": the row matches when ANY listed value is in the array.
-- Powers the Visits Report's service multi-select. Body = live definition
-- (20270106000330) with only that branch changed.

CREATE OR REPLACE FUNCTION public.crm_run_report(p_dataset text, p_columns text[], p_filters jsonb DEFAULT '[]'::jsonb, p_group_by text[] DEFAULT NULL::text[], p_aggregates jsonb DEFAULT '[]'::jsonb, p_sort_column text DEFAULT NULL::text, p_sort_dir text DEFAULT 'asc'::text, p_limit integer DEFAULT 1000, p_joins jsonb DEFAULT '[]'::jsonb, p_sorts jsonb DEFAULT NULL::jsonb)
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
  -- to America/New_York inside org_timezone()). Resolved in the body: a
  -- service-role caller (built-in scheduled delivery) has no org of its own and
  -- uses the org named by its org_id filter instead.
  v_tz text;
  v_scope_org text;
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
  -- Mirrors DATASET_PERMISSION_KEYS (src/lib/reports/report-permissions.ts):
  -- any one key opens the dataset (admins pass inside has_settings_permission).
  -- Keep the two in step when either changes.
  v_dataset_keys constant jsonb := '{
    "rpt_employees":           ["sched_rpt_employee_directory"],
    "rpt_timesheets":          ["sched_rpt_job_hours_summary", "sched_rpt_employee_directory"],
    "rpt_crew_drive_time":     ["sched_rpt_job_hours_summary"],
    "rpt_job_visits":          ["sched_rpt_job_costing", "sched_rpt_job_cost_summary", "sched_rpt_cogs", "sched_rpt_job_hours_summary"],
    "rpt_job_services":        ["sched_rpt_job_costing", "sched_rpt_job_cost_summary", "sched_rpt_cogs", "sched_rpt_job_hours_summary"],
    "rpt_projects_wip":        ["sched_rpt_job_costing", "sched_rpt_job_cost_summary"],
    "rpt_contracts":           ["crm_rpt_client_contracts", "sched_rpt_package_summary", "acct_rpt_invoiced_income_by_client", "acct_rpt_invoices_with_balances", "acct_rpt_ar_aging"],
    "rpt_invoices":            ["acct_rpt_invoiced_income_by_client", "acct_rpt_invoices_with_balances", "acct_rpt_ar_aging"],
    "rpt_invoice_line_items":  ["acct_rpt_invoiced_income_by_client", "acct_rpt_invoices_with_balances", "acct_rpt_ar_aging"],
    "rpt_payments":            ["acct_rpt_payment_audit_summary", "acct_rpt_invoiced_income_by_client", "acct_rpt_invoices_with_balances", "acct_rpt_ar_aging"],
    "rpt_estimates":           ["estimate_list", "crm_rpt_estimates_by_stage", "crm_rpt_won_estimates_by_service"],
    "rpt_estimate_line_items": ["estimate_list", "crm_rpt_estimates_by_stage", "crm_rpt_won_estimates_by_service"],
    "rpt_audit_log":           ["admin_rpt_audit_log", "admin_rpt_security_audit"]
  }'::jsonb;
  v_gate_datasets text[];
  v_gate_ds text;
  v_is_crew boolean;
begin
  if auth.uid() is not null
     and not (public.has_settings_permission('view_report_center') or public.my_role() = 'crew') then
    raise exception 'You do not have permission to run reports' using errcode = '42501';
  end if;
  if p_dataset is null or not (p_dataset = any(v_allowed_datasets)) then
    raise exception 'Unknown dataset: %', coalesce(p_dataset, '(null)');
  end if;

  -- An end user calling this RPC directly (anything but the app server's own
  -- report code, which applies these rules itself before calling — see
  -- _report_run_trusted) is running an ad-hoc analysis: it needs the dataset's
  -- permission key (and each joined dataset's), the Advanced Reporting add-on,
  -- and a crew login is held to the datasets of its org's crew-visible
  -- dashboard panels (getCrewRunnableScope in crew-dashboard-access.ts).
  if auth.uid() is not null and not public._report_run_trusted() then
    v_is_crew := (select public.my_role()) = 'crew';
    v_gate_datasets := array[p_dataset];
    for v_join in select * from jsonb_array_elements(coalesce(p_joins, '[]'::jsonb)) loop
      v_rel := v_relations -> p_dataset -> (v_join->>'alias');
      if v_rel is not null then
        v_gate_datasets := v_gate_datasets || (v_rel->>'dataset');
      end if;
    end loop;
    foreach v_gate_ds in array v_gate_datasets loop
      if v_dataset_keys ? v_gate_ds and not exists (
        select 1
          from jsonb_array_elements_text(v_dataset_keys -> v_gate_ds) k(key)
         where public.has_settings_permission(k.key)
      ) then
        raise exception 'You don''t have permission to query this dataset' using errcode = '42501';
      end if;
      if v_is_crew and not exists (
        select 1
          from public.crm_dashboards d
          cross join lateral jsonb_array_elements(coalesce(d.config -> 'tabs', '[]'::jsonb)) t(tab)
          cross join lateral jsonb_array_elements(coalesce(t.tab -> 'panels', '[]'::jsonb)) p(panel)
         where d.org_id = (select public.my_org_id())
           and d.visible_to_crew
           and d.deleted_at is null
           and coalesce(p.panel ->> 'reportKey', '') = ''
           and p.panel -> 'visual' -> 'config' ->> 'dataset' = v_gate_ds
      ) then
        raise exception 'You do not have permission to run reports' using errcode = '42501';
      end if;
    end loop;
    if not public.my_org_has_advanced_reporting() then
      raise exception 'Custom reports are part of the Advanced Reporting add-on. An admin can add it in Settings > Subscription.'
        using errcode = '42501';
    end if;
  end if;

  if auth.uid() is null then
    select f->>'value' into v_scope_org
      from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) f
      where f->>'column' = 'org_id'
        and lower(f->>'op') = 'eq'
        and (f->>'value') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      limit 1;
    if v_scope_org is not null then
      v_tz := public.org_timezone(v_scope_org::uuid);
    end if;
  end if;
  v_tz := coalesce(v_tz, public.my_timezone(), 'America/New_York');

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
      v_val := replace(replace(replace(coalesce(v_val, ''), '\', '\\'), '%', '\%'), '_', '\_');
      v_where_parts := v_where_parts || format('%s::text ilike %L', v_expr, '%' || v_val || '%');
    elsif v_op = 'in' then
      if jsonb_typeof(v_filter->'value') = 'array' and v_col_type = 'ARRAY' then
        -- array column (e.g. rpt_job_visits.service_ids): match when ANY selected value is in it
        v_where_parts := v_where_parts || format(
          '%s::text[] && array(select jsonb_array_elements_text(%L::jsonb))',
          v_expr, (v_filter->'value')::text);
      elsif jsonb_typeof(v_filter->'value') = 'array' then
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
      if v_val ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_op in ('eq', 'neq') then
        v_where_parts := v_where_parts || format(
          '%s(%s >= (%L::timestamp at time zone %L) and %s < ((%L::date + 1)::timestamp at time zone %L))',
          case when v_op = 'neq' then 'not ' else '' end,
          v_expr, v_val, v_tz, v_expr, v_val, v_tz);
      elsif v_val ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_op in ('lte', 'gt') then
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

  execute format('select count(*) from (%s) t', v_sql) into v_total;

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
