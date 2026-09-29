-- The contract-expiry cron ran daily across a 3-day window and notified the
-- rep (and fired the client's contract_about_to_expire automation) every day.
-- Record the end_date a reminder was sent for so it goes out once; renewing a
-- contract changes end_date, which naturally re-arms the reminder.
alter table public.crm_contracts
  add column if not exists expiry_notified_for date;
