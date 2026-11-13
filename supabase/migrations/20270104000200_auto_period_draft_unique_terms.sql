-- Auto-billed batch drafts are now also split by invoice TERMS
-- (complete-visit-side-effects.ts). The draft header carries one terms value
-- and a due date derived from it, so a job on different terms (say Net 30 vs
-- Due on Receipt) used to fold into the first job's draft and silently take
-- its terms. The one-open-draft guard from 20261229000120 must key on terms
-- too, or the second terms group's first visit would hit 23505 and be folded
-- into the wrong draft by the race-loser path.
--
-- The new key is a superset of the old one, so existing rows cannot violate it.

drop index if exists public.crm_invoices_auto_period_draft_unique;

create unique index if not exists crm_invoices_auto_period_draft_unique
  on public.crm_invoices (
    org_id,
    client_id,
    auto_bill_period_start,
    (coalesce(tax_rate_bps, 0)),
    (coalesce(sales_rep_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(po_number, '')),
    (coalesce(terms, ''))
  )
  where auto_bill_period_start is not null
    and status = 'draft'
    and deleted_at is null
    and locked = false;
