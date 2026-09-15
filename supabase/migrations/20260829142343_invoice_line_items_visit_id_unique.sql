-- Snow-job invoice generation (src/lib/hooks/use-snow-invoicing.ts) determines
-- which visits are still billable with a read (visits whose visit_id has no
-- line item on a non-deleted invoice) followed by a separate insert — a
-- double-click or two staff members generating invoices around the same time
-- can both read the same visit as uninvoiced and both insert a line item for
-- it, double-billing. Enforce this at the DB level instead of trusting the
-- read-then-insert window: a visit may have at most one crm_invoice_line_items
-- row.
--
-- A plain UNIQUE constraint is safe here even though most line items aren't
-- visit-linked at all (manual invoice lines, product lines, etc.) — SQL
-- treats every NULL as distinct from every other NULL, so any number of
-- rows with visit_id NULL are still allowed; only a real, non-null visit_id
-- can collide.
--
-- This can't be conditioned on the parent invoice's deleted_at (a unique
-- index's predicate can only reference the indexed table's own columns), so
-- useDeleteInvoice — the only path that discards an invoice while genuinely
-- meaning to free its visits back up for re-billing (draft-only, per its own
-- comment) — is updated alongside this migration to delete its line items
-- outright instead of leaving them dangling, since a voided (not deleted)
-- invoice's visits are intentionally never meant to become billable again.

alter table public.crm_invoice_line_items
  add constraint crm_invoice_line_items_visit_id_unique unique (visit_id);
