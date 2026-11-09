-- Stored dashboards carry their own copy of each panel's definition (a seeded template is
-- cloned into crm_dashboards.config once per org), so fixing the templates in code does not
-- reach existing dashboards. Rewrite the stored copies of the invoice-revenue panels the
-- templates just changed (bug sweep round 8, F5, owner rule (a): revenue excludes sales tax):
--
--   * "Invoiced Revenue (YTD)" gauge (Sales Overview + Operations Dashboard; the Operations
--     copy also counted DRAFT invoices via status <> 'void'),
--   * "Total Invoiced" KPI (A/R Overview),
--   * "Sum of Invoice Amount by Sales Rep ($)" pie (Sales),
--   * the "Invoiced Revenue YTD" gauge from the Graphics Library, if it was dropped in.
--
-- A panel is rewritten only if it reads rpt_invoices with EXACTLY one aggregate,
-- sum(total_cents), AND carries one of those templates' panel ids or titles — a panel a user
-- built themselves on another shape is left alone. For each such panel:
--   sum(total_cents)            -> sum(revenue_ex_tax_cents)   (aggregate, kpiColumn,
--                                  valueColumns, sortColumn, colorSpectrumColumns)
--   status <> 'void' filter     -> is_issued = true            (drafts are not revenue)
--   template title              -> same title marked pre-tax   (only if never renamed)
-- Also: the "Key Performance Indicators (Month-to-Date)" panel title becomes "(Last 7 Days)"
-- — the report has always compared the last 7 days with the 7 before.
-- Idempotent: a rewritten panel no longer matches.

create or replace function pg_temp.f5_fix_panel(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v jsonb := p;
  v_title text := p->>'title';
begin
  if p->>'reportKey' = 'kpi-week-over-week' and v_title = 'Key Performance Indicators (Month-to-Date)' then
    return jsonb_set(p, '{title}', to_jsonb('Key Performance Indicators (Last 7 Days)'::text));
  end if;

  if not (
    p->'visual'->'config'->>'dataset' = 'rpt_invoices'
    and p->'visual'->'config'->'aggregates' = '[{"column": "total_cents", "fn": "sum"}]'::jsonb
    and (p->>'id' in ('invoiced-revenue-ytd', 'invoice-amount-by-sales-rep-pie', 'total-invoiced')
         or v_title in ('Invoiced Revenue (YTD)', 'Invoiced Revenue YTD', 'Total Invoiced',
                        'Sum of Invoice Amount by Sales Rep ($)'))
  ) then
    return p;
  end if;

  v := jsonb_set(v, '{visual,config,aggregates}', '[{"column": "revenue_ex_tax_cents", "fn": "sum"}]'::jsonb);
  if v->'visual'->>'kpiColumn' = 'sum_total_cents' then
    v := jsonb_set(v, '{visual,kpiColumn}', '"sum_revenue_ex_tax_cents"'::jsonb);
  end if;
  if v->'visual'->'config'->>'sortColumn' = 'sum_total_cents' then
    v := jsonb_set(v, '{visual,config,sortColumn}', '"sum_revenue_ex_tax_cents"'::jsonb);
  end if;
  if jsonb_typeof(v->'visual'->'valueColumns') = 'array' then
    v := jsonb_set(v, '{visual,valueColumns}', (
      select coalesce(jsonb_agg(case when e = '"sum_total_cents"'::jsonb then '"sum_revenue_ex_tax_cents"'::jsonb else e end order by o), '[]'::jsonb)
      from jsonb_array_elements(v->'visual'->'valueColumns') with ordinality as t(e, o)));
  end if;
  if jsonb_typeof(v->'visual'->'colorSpectrumColumns') = 'array' then
    v := jsonb_set(v, '{visual,colorSpectrumColumns}', (
      select coalesce(jsonb_agg(case when e = '"sum_total_cents"'::jsonb then '"sum_revenue_ex_tax_cents"'::jsonb else e end order by o), '[]'::jsonb)
      from jsonb_array_elements(v->'visual'->'colorSpectrumColumns') with ordinality as t(e, o)));
  end if;
  if jsonb_typeof(v->'visual'->'config'->'filters') = 'array' then
    v := jsonb_set(v, '{visual,config,filters}', (
      select coalesce(jsonb_agg(case when e = '{"column": "status", "op": "neq", "value": "void"}'::jsonb
                                     then '{"column": "is_issued", "op": "eq", "value": true}'::jsonb
                                     else e end order by o), '[]'::jsonb)
      from jsonb_array_elements(v->'visual'->'config'->'filters') with ordinality as t(e, o)));
  end if;
  v := case v_title
         when 'Invoiced Revenue (YTD)' then jsonb_set(v, '{title}', '"Invoiced Revenue (YTD, pre-tax)"'::jsonb)
         when 'Invoiced Revenue YTD' then jsonb_set(v, '{title}', '"Invoiced Revenue YTD (pre-tax)"'::jsonb)
         when 'Total Invoiced' then jsonb_set(v, '{title}', '"Total Invoiced (pre-tax)"'::jsonb)
         when 'Sum of Invoice Amount by Sales Rep ($)' then jsonb_set(v, '{title}', '"Sum of Invoice Amount by Sales Rep (pre-tax $)"'::jsonb)
         else v
       end;
  return v;
end;
$$;

create or replace function pg_temp.f5_fix_config(c jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(c->'tabs') <> 'array' then c else
    jsonb_set(c, '{tabs}', (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(t->'panels') = 'array' then
                 jsonb_set(t, '{panels}', (
                   select coalesce(jsonb_agg(pg_temp.f5_fix_panel(p) order by po), '[]'::jsonb)
                   from jsonb_array_elements(t->'panels') with ordinality as pp(p, po)))
               else t end
             order by tord), '[]'::jsonb)
      from jsonb_array_elements(c->'tabs') with ordinality as tt(t, tord)))
  end;
$$;

update public.crm_dashboards d
   set config = pg_temp.f5_fix_config(d.config)
 where d.config is not null
   and pg_temp.f5_fix_config(d.config) is distinct from d.config;
