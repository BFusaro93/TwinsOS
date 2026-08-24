-- WIP (work-in-progress) schedule for Equipt/PO Projects.
--
-- Adds an explicit, re-forecastable EAC (estimated cost at completion) field —
-- projects.total_cost is a stale cost cache, not a budget, so it can't stand in
-- for one. Then a rpt_projects_wip view rolls up cost-to-date (mirroring the
-- client-side calc in src/lib/hooks/use-projects.ts) and billed-to-date (via
-- crm_jobs.project_id, the only link crm_invoices has back to a project) into
-- the standard cost-to-cost WIP columns: % complete, earned revenue, and
-- over/under billing.

alter table public.projects
  add column if not exists estimated_cost_cents integer not null default 0;

create or replace view rpt_projects_wip
with (security_invoker = on) as
select
  p.id,
  p.name,
  p.status,
  coalesce(cl.display_name, p.customer_name) as client_name,
  p.contract_price as contract_cents,
  p.estimated_cost_cents as eac_cents,
  (p.contract_price - p.estimated_cost_cents) as estimated_gp_cents,
  case when p.contract_price > 0
    then round((p.contract_price - p.estimated_cost_cents)::numeric / p.contract_price * 100, 1)
  end as estimated_gp_pct,
  cost.cost_to_date_cents,
  case when p.estimated_cost_cents > 0
    then round(least(cost.cost_to_date_cents, p.estimated_cost_cents)::numeric / p.estimated_cost_cents * 100, 1)
    else 0
  end as pct_complete,
  round(
    p.contract_price * case when p.estimated_cost_cents > 0
      then least(cost.cost_to_date_cents, p.estimated_cost_cents)::numeric / p.estimated_cost_cents
      else 0
    end
  )::int as earned_revenue_cents,
  coalesce(bill.billed_cents, 0) as billed_cents,
  coalesce(bill.billed_cents, 0) - round(
    p.contract_price * case when p.estimated_cost_cents > 0
      then least(cost.cost_to_date_cents, p.estimated_cost_cents)::numeric / p.estimated_cost_cents
      else 0
    end
  )::int as over_under_billed_cents,
  (p.contract_price - coalesce(bill.billed_cents, 0)) as remaining_to_bill_cents,
  p.start_date,
  p.end_date,
  p.created_at
from public.projects p
left join public.clients cl on cl.id = p.client_id and cl.deleted_at is null
left join lateral (
  select
    coalesce(sum(pli.total_cost), 0)
      + coalesce(sum(case when pli.taxable is distinct from false
          then round(pli.total_cost * po.tax_rate_percent / 100.0) else 0 end), 0)
      + coalesce(sum(case when po.shipping_cost > 0 and po.subtotal > 0
          then round((pli.total_cost::numeric / po.subtotal) * po.shipping_cost) else 0 end), 0)
    as po_cents
  from public.po_line_items pli
  join public.purchase_orders po on po.id = pli.po_id and po.deleted_at is null
  where pli.project_id = p.id
) po_costs on true
left join lateral (
  -- Excludes requisition lines already converted to a PO — that cost is
  -- already counted via po_costs above (mirrors use-projects.ts).
  select
    coalesce(sum(rli.total_cost), 0)
      + coalesce(sum(round(rli.total_cost * r.tax_rate_percent / 100.0)), 0)
    as req_cents
  from public.requisition_line_items rli
  join public.requisitions r on r.id = rli.requisition_id and r.deleted_at is null
  where rli.project_id = p.id
    and not (r.status = 'ordered' and r.converted_po_id is not null)
) req_costs on true
left join lateral (
  select coalesce(sum(round(di.quantity * di.unit_cost)), 0) as direct_cents
  from public.project_direct_items di
  where di.project_id = p.id and di.deleted_at is null
) direct_costs on true
left join lateral (
  select coalesce(sum(sc.amount), 0) as subcontract_cents
  from public.project_subcontract_costs sc
  where sc.project_id = p.id and sc.deleted_at is null
) sub_costs on true
cross join lateral (
  select (po_costs.po_cents + req_costs.req_cents + direct_costs.direct_cents + sub_costs.subcontract_cents)
    as cost_to_date_cents
) cost
left join lateral (
  -- crm_invoices has no direct project_id — the only link back to a project
  -- is through the project-type crm_jobs row it was billed against.
  select coalesce(sum(i.total_cents), 0) as billed_cents
  from public.crm_invoices i
  join public.crm_jobs j on j.id = i.crm_job_id and j.deleted_at is null
  where j.project_id = p.id and i.deleted_at is null
) bill on true
where p.deleted_at is null;

-- Re-whitelist crm_run_report's allowed datasets to include rpt_projects_wip.
-- Function body is otherwise unchanged from 20260720000002_crm_run_report_allow_ungrouped_aggregates.sql
-- (the latest prior definition) — only the dataset whitelist array changed.
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
    'rpt_projects_wip'
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
