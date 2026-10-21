-- One reminder per warranty end date: the daily cron claims a warranty by setting
-- expiry_notified_for = end_date before notifying. Renewing or editing the end date
-- changes end_date, which re-arms the reminder for the new date.
alter table public.crm_warranties
  add column if not exists expiry_notified_for date;
