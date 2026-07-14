-- Per-line-item discounts for invoices and estimates, in addition to the
-- existing whole-document discount_cents on crm_invoices/estimates.
-- Stored as a resolved cents amount (not percent+type) to match the existing
-- document-level discount pattern — same tradeoff: a percent-based discount
-- doesn't auto-recompute if qty/rate change later, matching current behavior
-- of the document-level discount.
alter table crm_invoice_line_items
  add column if not exists discount_cents integer not null default 0;

alter table estimate_line_items
  add column if not exists discount_cents integer not null default 0;
