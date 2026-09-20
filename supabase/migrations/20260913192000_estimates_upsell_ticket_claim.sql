-- Makes "convert this upsell ticket into an estimate" a claim rather than a
-- sequence of hopeful writes.
--
-- useCreateEstimateFromUpsell did four unrelated writes from the browser:
-- insert the estimate, insert its line item, recalc the header totals, insert
-- the crm_ticket_links row. Only the LAST one records that the ticket was
-- converted, and it is also the one most likely to be skipped — the tab
-- closes, the RLS check fails, the network drops. The button's own guard
-- (`hasEstimateLink`) then still reads false, so it reappears and the next
-- click builds a SECOND estimate. Two people opening the same ticket produce
-- two estimates for the same work even when nothing fails at all.
--
-- The fix is to let the estimate row itself carry the claim, so the claim is
-- taken by the first write instead of the last, in one statement, with no lock
-- to hold and no race to lose.
alter table public.estimates
  add column if not exists upsell_ticket_id uuid references public.crm_tickets(id);

-- One live estimate per converted ticket. Partial on deleted_at so a
-- soft-deleted estimate releases its ticket: deleting a mistaken conversion
-- has to leave the ticket convertible again, or the office is stuck with an
-- upsell it can never quote.
--
-- Deliberately NOT a constraint on crm_ticket_links. A ticket is allowed to
-- carry several estimate links — re-quoting work is normal, and rpt_upsells
-- already reads `distinct on (ticket_id) … order by created_at desc` because
-- of it. What must be unique is the ONE-CLICK conversion, not the link.
create unique index if not exists estimates_upsell_ticket_unique
  on public.estimates (upsell_ticket_id)
  where upsell_ticket_id is not null and deleted_at is null;

comment on column public.estimates.upsell_ticket_id is
  'The crew upsell ticket this estimate was converted from, if any. Uniquely claimed — see estimates_upsell_ticket_unique.';
