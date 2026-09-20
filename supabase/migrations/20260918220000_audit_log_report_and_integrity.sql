-- ─────────────────────────────────────────────────────────────────────────────
-- Org-wide audit log: a Report Center dataset, plus two integrity fixes.
--
-- 1. `rpt_audit_log` — until now every audit entry was only reachable from one
--    record's detail panel. There was no "who changed what today", no export,
--    and the entries for employees, roles, discounts, credentials and settings
--    had nowhere to be read at all. This view feeds the Report Center like any
--    other dataset (security_invoker, so audit_log's RLS still scopes it to the
--    caller's org) and adds a `category` so a security review can filter to
--    access/credential changes without knowing every record_type by name.
--
-- 2. audit_log INSERT is closed to browser clients. The policy was named
--    `service_insert_audit_log` but its only check was `org_id = my_org_id()`,
--    so any authenticated member could write arbitrary rows — including rows
--    naming someone else as the actor. A trail that can be forged is not
--    evidence. Legitimate writers are unaffected: fn_audit_log() and
--    insert_audit_entry() are SECURITY DEFINER owned by postgres, and
--    audit_log is not FORCE ROW LEVEL SECURITY, so both bypass RLS; server
--    routes use the service-role key, which also bypasses it.
--    The one browser-side caller (logCatalogNameConflict in
--    use-purchase-orders.ts) moves to insert_audit_entry() in the same change
--    — which also means the entry gets the real user's name instead of the
--    hardcoded "System" it was claiming.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.rpt_audit_log;

CREATE VIEW public.rpt_audit_log
WITH (security_invoker = on) AS
SELECT
  a.id,
  a.created_at                                   AS occurred_at,
  a.record_type                                  AS record_kind,
  initcap(replace(a.record_type, '_', ' '))      AS record_label,
  a.record_id,
  a.action,
  a.changed_by_name                              AS changed_by,
  p.email                                        AS changed_by_email,
  a.description,
  a.field_changed,
  a.old_value,
  a.new_value,
  CASE
    WHEN a.record_type IN (
      'user', 'role', 'api_key', 'integration', 'oauth_token', 'approval_flow'
    ) THEN 'Security & Access'
    WHEN a.record_type IN (
      'invoice', 'estimate', 'contract', 'po', 'requisition', 'receiving',
      'project', 'financial_period', 'discount', 'overhead_settings'
    ) THEN 'Money'
    WHEN a.record_type IN (
      'job', 'job_visit', 'work_order', 'asset', 'vehicle', 'part',
      'pm_schedule', 'request', 'job_photo', 'damage_case', 'meter_reading',
      'crew', 'ticket', 'client'
    ) THEN 'Operations'
    ELSE 'Setup & Config'
  END                                            AS category,
  a.org_id
FROM public.audit_log a
LEFT JOIN public.profiles p ON p.id = a.created_by
WHERE a.deleted_at IS NULL;

COMMENT ON VIEW public.rpt_audit_log IS
  'Org-wide audit trail for the Report Center. security_invoker, so audit_log RLS scopes it to the caller''s org.';

-- ── Report Center dataset whitelist ──────────────────────────────────────────
-- Restated in full: crm_run_report has had a later drop/create silently lose
-- an in-function check before, so the whole body is written out rather than
-- patched (see the price-run permission regression).

CREATE OR REPLACE FUNCTION public.crm_run_report(
  p_dataset text,
  p_columns text[],
  p_filters jsonb DEFAULT '[]'::jsonb,
  p_group_by text[] DEFAULT NULL::text[],
  p_aggregates jsonb DEFAULT '[]'::jsonb,
  p_sort_column text DEFAULT NULL::text,
  p_sort_dir text DEFAULT 'asc'::text,
  p_limit integer DEFAULT 1000
)
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
    'rpt_projects_wip', 'rpt_sales_rep_month', 'rpt_tickets',
    'rpt_audit_log'
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
$function$;

-- ── Close the forgeable INSERT path ──────────────────────────────────────────

DROP POLICY IF EXISTS service_insert_audit_log ON public.audit_log;

-- No INSERT policy is created in its place on purpose. Every legitimate
-- writer either owns the table (SECURITY DEFINER: fn_audit_log,
-- insert_audit_entry) or uses the service-role key; both bypass RLS. A
-- browser client now has no way to write audit_log at all, and still has no
-- UPDATE or DELETE policy, so entries are append-only and unforgeable from
-- the client side.
