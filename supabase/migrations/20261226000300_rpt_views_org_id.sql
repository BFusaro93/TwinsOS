-- Report views: append org_id so a SCHEDULED custom analysis (which runs from the cron
-- with the service role, i.e. no RLS) can be scoped to its org on ANY dataset
-- (crm_run_report_for_org ANDs `org_id = p_org_id` into every query).
--
-- ADDITIVE: org_id is appended as the LAST column of each view that lacks it, taken from
-- the view's base table (the first table in its FROM clause), which must itself have an
-- org_id column. The new column never changes an existing column's name, position or type.
-- The rewrite reads each view's LIVE definition, so it picks up whatever the view is now.
-- Views it cannot rewrite safely (UNION / GROUP BY / no org_id on the base table) are
-- skipped with a NOTICE and stay unschedulable until handled by hand. security_invoker
-- is kept, so RLS still scopes interactive callers exactly as before.

do $$
declare
  v_view text;
  v_def text;
  v_depth int;
  v_i int;
  v_from int;
  v_rest text;
  v_alias text;
  v_table text;
  v_new text;
  v_len int;
  v_ch text;
  v_views constant text[] := array[
    'rpt_address_verification','rpt_chemical_applications','rpt_client_activity',
    'rpt_client_contacts','rpt_clients','rpt_contracts','rpt_crew_drive_time',
    'rpt_employees','rpt_estimate_line_items','rpt_estimates','rpt_invoice_line_items',
    'rpt_invoices','rpt_job_services','rpt_jobs','rpt_payments','rpt_products',
    'rpt_projects_wip','rpt_services','rpt_tickets','rpt_timesheets','rpt_upsells','rpt_vendors'
  ];
begin
  foreach v_view in array v_views loop
    if to_regclass('public.' || v_view) is null then continue; end if;
    if exists (select 1 from pg_attribute a where a.attrelid = ('public.' || v_view)::regclass
               and a.attname = 'org_id' and not a.attisdropped) then
      continue; -- already has it
    end if;
    v_def := rtrim(pg_get_viewdef(('public.' || v_view)::regclass, true), E'; \n');

    -- find the top-level FROM (paren depth 0, outside quotes)
    v_depth := 0; v_from := 0; v_len := length(v_def); v_i := 1;
    while v_i <= v_len loop
      v_ch := substr(v_def, v_i, 1);
      if v_ch = '''' then
        v_i := v_i + 1;
        while v_i <= v_len and substr(v_def, v_i, 1) <> '''' loop v_i := v_i + 1; end loop;
      elsif v_ch = '(' then v_depth := v_depth + 1;
      elsif v_ch = ')' then v_depth := v_depth - 1;
      elsif v_depth = 0 and v_i > 6 and upper(substr(v_def, v_i - 1, 6)) = E'\nFROM ' then
        v_from := v_i - 1; exit;
      elsif v_depth = 0 and upper(substr(v_def, v_i, 6)) = ' FROM ' then
        v_from := v_i; exit;
      end if;
      v_i := v_i + 1;
    end loop;
    if v_from = 0 then raise notice 'SKIP %: no top-level FROM', v_view; continue; end if;

    if v_def ~* '(^|[\s)])(union|intersect|except)\s' or v_def ~* '\sgroup\s+by\s' then
      raise notice 'SKIP %: UNION/GROUP BY', v_view; continue;
    end if;

    -- base table + alias: "FROM <table> [alias]"
    v_rest := ltrim(substr(v_def, v_from + 5));
    v_table := substring(v_rest from '^([a-z_][a-z0-9_]*)');
    if v_table is null or v_rest like '(%' then
      raise notice 'SKIP %: base is not a plain table', v_view; continue;
    end if;
    v_alias := substring(v_rest from '^[a-z_][a-z0-9_]*\s+(?:AS\s+)?([a-z_][a-z0-9_]*)');
    if v_alias is null or upper(v_alias) in ('LEFT','JOIN','INNER','CROSS','WHERE','ORDER','RIGHT','FULL','ON','LATERAL','NATURAL') then
      v_alias := v_table;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = v_table and column_name = 'org_id') then
      raise notice 'SKIP %: base table % has no org_id', v_view, v_table; continue;
    end if;

    v_new := substr(v_def, 1, v_from - 1) || E',\n    ' || v_alias || '.org_id AS org_id' || substr(v_def, v_from);
    begin
      execute format('create or replace view public.%I with (security_invoker = on) as %s', v_view, v_new);
      raise notice 'OK %: org_id from %.%', v_view, v_table, v_alias;
    exception when others then
      raise notice 'SKIP %: %', v_view, sqlerrm;
    end;
  end loop;
end $$;

-- rpt_address_verification is a UNION ALL of three branches, so the generic rewrite above
-- skips it; each branch gets its own table's org_id (appended last).
do $$
begin
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.rpt_address_verification'::regclass
             and a.attname = 'org_id' and not a.attisdropped) then
    return;
  end if;
  create or replace view public.rpt_address_verification with (security_invoker = on) as
   SELECT 'Client'::text AS record_kind,
      c.id AS record_id,
      c.display_name AS client_name,
      NULL::text AS label,
      c.status AS client_status,
      c.service_address AS address,
      c.service_city AS city,
      c.service_state AS state,
      c.service_zip AS zip,
      COALESCE(c.address_verdict, 'never_checked'::text) AS address_verdict,
      c.address_verified_at,
      c.org_id AS org_id
     FROM clients c
    WHERE c.deleted_at IS NULL AND COALESCE(btrim(c.service_address), ''::text) <> ''::text
  UNION ALL
   SELECT 'Property'::text AS record_kind,
      p.id AS record_id,
      c.display_name AS client_name,
      p.name AS label,
      c.status AS client_status,
      p.address,
      p.city,
      p.state,
      p.zip,
      COALESCE(p.address_verdict, 'never_checked'::text) AS address_verdict,
      p.address_verified_at,
      p.org_id AS org_id
     FROM client_properties p
       JOIN clients c ON c.id = p.client_id
    WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND COALESCE(btrim(p.address), ''::text) <> ''::text
  UNION ALL
   SELECT 'Crew Yard'::text AS record_kind,
      w.id AS record_id,
      NULL::text AS client_name,
      w.name AS label,
      NULL::text AS client_status,
      w.starting_address AS address,
      w.starting_city AS city,
      w.starting_state AS state,
      w.starting_zip AS zip,
      COALESCE(w.address_verdict, 'never_checked'::text) AS address_verdict,
      w.address_verified_at,
      w.org_id AS org_id
     FROM crm_crews w
    WHERE w.deleted_at IS NULL AND COALESCE(btrim(w.starting_address), ''::text) <> ''::text;
end $$;
