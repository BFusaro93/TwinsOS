-- po_line_items.taxable exists on prod (added ad hoc, no migration ever committed)
-- but was missing on test, breaking any query that selects it there.
alter table public.po_line_items
  add column if not exists taxable boolean not null default true;
