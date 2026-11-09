-- One open auto-created draft per client + billing period + tax rate.
--
-- Weekly/monthly-billed clients fold every completed visit of a period into one draft invoice
-- (src/lib/visits/complete-visit-side-effects.ts). The "find an open draft, else create one" step
-- was an unlocked select followed by an insert, so two visits of the same client completing at the
-- same instant (two crews, two dispatchers, a crew plus the office) each missed the other's draft
-- and each created their own: the stress sweep (2026-11-08) saw duplicate drafts for 32 of 36
-- clients when both visits completed together. bulk-complete already serialized its own batch; this
-- closes it for completions arriving in separate requests.
--
-- auto_bill_period_start is set ONLY by that auto path (to the period's first day), so every other
-- invoice (manual, contract, project, estimate, daily/upon-completion billing) is outside the index.
-- A draft that is sent, locked or deleted leaves the index, so the next visit in the period starts a
-- new draft exactly as before. The code that loses the race re-finds the winner's draft and appends
-- to it through increment_invoice_totals (row lock + tax re-derivation).
ALTER TABLE public.crm_invoices ADD COLUMN IF NOT EXISTS auto_bill_period_start date;

CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_auto_period_draft_unique
  ON public.crm_invoices (org_id, client_id, auto_bill_period_start, (COALESCE(tax_rate_bps, 0)))
  WHERE auto_bill_period_start IS NOT NULL
    AND status = 'draft'
    AND deleted_at IS NULL
    AND locked = false;
