-- Continuous "color spectrum" cell shading (light-to-dark by magnitude) for
-- numeric table columns, as an alternative/complement to the discrete
-- FormatRule threshold coloring already stored in crm_custom_reports.

alter table crm_custom_reports
  add column if not exists color_spectrum_columns text[] not null default '{}';
