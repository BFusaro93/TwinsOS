-- Hide an invoice line from what the customer sees (PDF, emailed invoice,
-- online invoice) without removing it. The line stays on the invoice, keeps
-- its amount in the stored subtotal / tax / total, keeps its visit tag and
-- job-product link, and still syncs to accounting — only the customer-facing
-- rendering folds its amount into the nearest visible line above it
-- (src/lib/invoices/hidden-lines.ts), so printed rows still add up to the
-- printed Subtotal.
alter table public.crm_invoice_line_items
  add column if not exists hide_on_print boolean not null default false;
