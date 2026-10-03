-- 1) Open-dispute flag on invoices. A chargeback reopens the invoice (the payment
--    is reversed), so it reappears in the autopay "To Charge" queues; if the
--    dispute is later WON the funds come back and a re-charge would collect
--    twice. The Stripe webhook sets this to the disputed payment's id while the
--    dispute is open and clears it when it closes; charge routes and the queues
--    refuse/skip flagged invoices.
alter table public.crm_invoices
  add column if not exists open_dispute_payment_id uuid references public.crm_payments(id) on delete set null;

create index if not exists idx_crm_invoices_open_dispute
  on public.crm_invoices (open_dispute_payment_id) where open_dispute_payment_id is not null;

-- 2) Approver-email throttle: remember when each pending approval request was
--    last emailed so /api/approval-requests/notify can't be used to re-spam an
--    approver (one re-send per approver per 10 minutes).
alter table public.approval_requests
  add column if not exists last_notified_at timestamptz;
