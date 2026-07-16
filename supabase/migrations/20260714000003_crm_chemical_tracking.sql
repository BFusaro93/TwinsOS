-- Chemical Tracking (CRM module): pesticide/fertilizer application recordkeeping
-- for state regulatory compliance, modeled after Service Autopilot's Chemical
-- Tracking feature. crm_services.track_chemicals and crm_employees.applicator_license
-- already existed (scaffolded, unused) — this migration builds out the rest.

-- ============================================================
-- 1. product_items: chemical-specific fields
-- ============================================================
-- A Chemical Product is just a product_items row with track_chemicals=true,
-- same as CMMS parts reuse product_items via part_category (see
-- 20260326000012_product_items_part_fields.sql).

alter table public.product_items
  add column if not exists track_chemicals            boolean not null default false,
  add column if not exists scientific_name             text,
  add column if not exists epa_registration_number     text,
  add column if not exists epa_url                     text,
  add column if not exists label_instructions          text,
  add column if not exists route_sheet_instructions    text;

-- ============================================================
-- 2. Lookup lists (Application Methods, Targets, Volume Units,
--    Area Units, Areas Treated) — one discriminated table, mirroring
--    the client_activity single-table-with-discriminator pattern.
-- ============================================================

create table if not exists crm_chemical_lookup_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id) on delete cascade,
  list_type   text not null check (list_type in
                ('application_method', 'target', 'volume_unit', 'area_unit', 'areas_treated')),
  name        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index on crm_chemical_lookup_items (org_id, list_type) where deleted_at is null;

alter table crm_chemical_lookup_items enable row level security;

create policy "org members can manage crm_chemical_lookup_items"
  on crm_chemical_lookup_items for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_chemical_lookup_items_updated_at
  before update on crm_chemical_lookup_items
  for each row execute function set_updated_at();

-- ============================================================
-- 3. Application rates — one or more method/rate combos per chemical product
-- ============================================================

create table if not exists crm_chemical_application_rates (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null default my_org_id() references organizations(id) on delete cascade,
  product_id             uuid not null references product_items(id) on delete cascade,
  application_method_id  uuid references crm_chemical_lookup_items(id) on delete set null,
  rate_qty               numeric,
  unit_of_measure_id     uuid references crm_chemical_lookup_items(id) on delete set null,
  area_qty               numeric,
  area_unit_id           uuid references crm_chemical_lookup_items(id) on delete set null,
  product_cost_cents     integer not null default 0,
  is_default             boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index on crm_chemical_application_rates (org_id, product_id);

alter table crm_chemical_application_rates enable row level security;

create policy "org members can manage crm_chemical_application_rates"
  on crm_chemical_application_rates for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_chemical_application_rates_updated_at
  before update on crm_chemical_application_rates
  for each row execute function set_updated_at();

-- ============================================================
-- 4. Service-level default chemicals ("Products & Mixes" tab on Service)
-- ============================================================

create table if not exists crm_service_chemicals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id) on delete cascade,
  service_id  uuid not null references crm_services(id) on delete cascade,
  product_id  uuid not null references product_items(id) on delete cascade,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now()
);

create index on crm_service_chemicals (org_id, service_id);

alter table crm_service_chemicals enable row level security;

create policy "org members can manage crm_service_chemicals"
  on crm_service_chemicals for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

-- ============================================================
-- 5. Chemical applications — the compliance-critical record,
--    one row per product actually used on a visit.
-- ============================================================

create table if not exists crm_chemical_applications (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null default my_org_id() references organizations(id) on delete cascade,
  job_id                      uuid not null references crm_jobs(id) on delete cascade,
  visit_id                    uuid references crm_job_visits(id) on delete cascade,
  product_id                  uuid references product_items(id) on delete set null,
  chemical_amount             numeric,
  solution_amount             numeric,
  unit_of_measure_id          uuid references crm_chemical_lookup_items(id) on delete set null,
  target_ids                  uuid[] not null default '{}',
  areas_treated_ids           uuid[] not null default '{}',
  application_method_id       uuid references crm_chemical_lookup_items(id) on delete set null,
  application_rate_label      text,
  used                        boolean not null default true,
  applicator_employee_id      uuid references crm_employees(id) on delete set null,
  -- snapshotted at save time — license numbers and EPA registrations can
  -- change later, but the compliance record must reflect what was true then.
  applicator_license_number   text,
  epa_number_snapshot         text,
  application_start_time      timestamptz,
  application_end_time        timestamptz,
  temperature                 numeric,
  wind_speed                  numeric,
  wind_direction              text,
  ph_level                    numeric,
  budgeted_concentrate_amount numeric,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id) on delete set null,
  deleted_at                  timestamptz
);

create index on crm_chemical_applications (org_id, job_id) where deleted_at is null;
create index on crm_chemical_applications (org_id, visit_id) where deleted_at is null;

alter table crm_chemical_applications enable row level security;

create policy "org members can manage crm_chemical_applications"
  on crm_chemical_applications for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_chemical_applications_updated_at
  before update on crm_chemical_applications
  for each row execute function set_updated_at();

-- ============================================================
-- 6. Org-level general chemical settings (one row per org)
-- ============================================================

create table if not exists crm_chemical_settings (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null unique default my_org_id() references organizations(id) on delete cascade,
  default_unit_of_measure_id  uuid references crm_chemical_lookup_items(id) on delete set null,
  conditions_display          text not null default 'weather'
                                check (conditions_display in ('weather', 'ph', 'both', 'neither')),
  auto_calc_quantity          boolean not null default false,
  updated_at                  timestamptz not null default now()
);

alter table crm_chemical_settings enable row level security;

create policy "org members can manage crm_chemical_settings"
  on crm_chemical_settings for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_chemical_settings_updated_at
  before update on crm_chemical_settings
  for each row execute function set_updated_at();

-- ============================================================
-- 7. Reporting view + RPC whitelist
-- ============================================================

create or replace view rpt_chemical_applications
with (security_invoker = on) as
select
  ca.id,
  j.scheduled_date as service_date,
  c.display_name as client_name,
  j.service_address,
  j.service_city,
  j.service_state,
  j.service_zip,
  p.name as chemical_name,
  p.epa_registration_number,
  ca.epa_number_snapshot,
  ca.chemical_amount,
  ca.solution_amount,
  uom.name as unit_of_measure,
  ca.application_rate_label,
  meth.name as application_method,
  ca.temperature,
  ca.wind_speed,
  ca.wind_direction,
  ca.ph_level,
  ca.used,
  trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as applicator_name,
  ca.applicator_license_number,
  ca.application_start_time,
  ca.application_end_time,
  ca.budgeted_concentrate_amount,
  ca.notes
from crm_chemical_applications ca
join crm_jobs j on j.id = ca.job_id and j.deleted_at is null
join clients c on c.id = j.client_id and c.deleted_at is null
left join product_items p on p.id = ca.product_id
left join crm_chemical_lookup_items uom on uom.id = ca.unit_of_measure_id
left join crm_chemical_lookup_items meth on meth.id = ca.application_method_id
left join crm_employees e on e.id = ca.applicator_employee_id
where ca.deleted_at is null;

-- Re-declare crm_run_report with rpt_chemical_applications added to the
-- dataset whitelist. Body is otherwise identical to
-- 20260706000010_crm_report_center.sql — see that file for the detailed
-- comment on why every identifier goes through information_schema + %I/%L.
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
$$;

revoke all on function crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer) from public;
grant execute on function crm_run_report(text, text[], jsonb, text[], jsonb, text, text, integer) to authenticated;
