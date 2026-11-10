-- Auto-billed batch drafts are now split per client + period + tax rate +
-- SALES REP + PO NUMBER (complete-visit-side-effects.ts).
--
-- A batch draft's header carries one sales_rep_id (who earns the commission)
-- and one po_number, but until now the first job's rep and PO were stamped on
-- the whole period's draft and every other job of that client folded in under
-- them — wrong commission and the wrong PO on the printed invoice. The code
-- now looks for (and creates) a draft per rep + PO, so the one-open-draft
-- guard from 20261228000200 must key on them too: otherwise the second rep's
-- first visit would hit 23505 and be folded into the first rep's draft by the
-- race-loser path, i.e. the very mix-up this fixes.
--
-- Daily-billed clients also batch now (one invoice per client per service
-- day); their drafts carry auto_bill_period_start = that day, so the same
-- index covers them.
--
-- The new key is a superset of the old one, so existing rows cannot violate it.
-- Blank POs are written as NULL by the auto path; '' and NULL are treated alike here.

drop index if exists public.crm_invoices_auto_period_draft_unique;

create unique index if not exists crm_invoices_auto_period_draft_unique
  on public.crm_invoices (
    org_id,
    client_id,
    auto_bill_period_start,
    (coalesce(tax_rate_bps, 0)),
    (coalesce(sales_rep_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(po_number, ''))
  )
  where auto_bill_period_start is not null
    and status = 'draft'
    and deleted_at is null
    and locked = false;
