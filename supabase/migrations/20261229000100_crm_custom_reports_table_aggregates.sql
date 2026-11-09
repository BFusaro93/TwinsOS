-- Column summaries (Sum / Average / Count / ...) picked from a report table's
-- header menu, saved with the analysis so they come back when it's reopened and
-- appear in its scheduled PDF/Excel sends. Shape: { "<column key>": "<fn>" }.

alter table crm_custom_reports
  add column if not exists table_aggregates jsonb not null default '{}'::jsonb;
