-- Per-estimate payment terms override (defaults to org-wide billing terms when null)
alter table estimates
  add column if not exists payment_terms text;
