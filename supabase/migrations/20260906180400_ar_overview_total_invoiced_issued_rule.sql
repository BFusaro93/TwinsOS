-- E-18: A/R Overview dashboard → Overview tab → "Total Invoiced" KPI included
-- draft invoices ($7,835 vs $1,485 issued on the sandbox org).
--
-- Root cause: dashboards are seeded by cloning the template in
-- src/lib/reports/dashboard-templates.ts into crm_dashboards.config
-- (ensureSystemDashboardsSeeded, upsert with ignoreDuplicates) — the row is a
-- snapshot. The template's total-invoiced panel was later changed from
-- `status neq void` to the issued-invoice rule (`is_issued eq true`, Rule A in
-- src/lib/reports/helpers.ts), but every org seeded before that change still
-- runs the old filter. The template itself is already correct; this is a
-- data migration for the seeded rows.
--
-- Scope — "template content, not user content" is decided at the PANEL level,
-- not by the row flag: the sandbox org's visible A/R Overview is NOT the
-- system-seeded row (that one was soft-deleted 8/29) but a copy the user
-- created from the template afterwards (is_system_seeded = false,
-- source_template_key null) that carries the template's panel byte-for-byte.
-- So we match any live dashboard whose "Total Invoiced" panel is still EXACTLY
-- the original template panel: id/title, dataset rpt_invoices, aggregate
-- sum(total_cents), and filters precisely
-- [{"column":"status","op":"neq","value":"void"}]. Any panel a user touched
-- (different filters, dataset, or aggregate) is left alone, and only that one
-- panel's `filters` key is replaced via jsonb_set, so every other edit on the
-- dashboard survives. 3 rows matched on PROD at the time of writing: the
-- seeded rows of orgs 619de9bb-… and ea489903-… and the sandbox's user copy
-- aabfdf98-…; all three have created_at = updated_at (never edited).
--
-- Expected sandbox: A/R Overview → Overview → Total Invoiced (this month) → $1,485.

with target as (
  select d.id,
         t.tab_idx - 1 as tab_idx,
         p.panel_idx - 1 as panel_idx
    from crm_dashboards d
    cross join lateral jsonb_array_elements(d.config -> 'tabs') with ordinality as t(tab, tab_idx)
    cross join lateral jsonb_array_elements(t.tab -> 'panels') with ordinality as p(panel, panel_idx)
   where d.deleted_at is null
     and (p.panel ->> 'id' = 'total-invoiced' or p.panel ->> 'title' = 'Total Invoiced')
     and p.panel -> 'visual' ->> 'type' = 'kpi'
     and p.panel -> 'visual' -> 'config' ->> 'dataset' = 'rpt_invoices'
     and p.panel -> 'visual' -> 'config' -> 'aggregates'
         = '[{"column":"total_cents","fn":"sum"}]'::jsonb
     and p.panel -> 'visual' -> 'config' -> 'filters'
         = '[{"column":"status","op":"neq","value":"void"}]'::jsonb
)
update crm_dashboards d
   set config = jsonb_set(
                  d.config,
                  array['tabs', target.tab_idx::text, 'panels', target.panel_idx::text, 'visual', 'config', 'filters'],
                  '[{"column":"is_issued","op":"eq","value":true}]'::jsonb,
                  false),
       updated_at = now()
  from target
 where d.id = target.id;
