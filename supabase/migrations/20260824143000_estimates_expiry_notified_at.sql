-- /api/crm/estimates/expiry-notify (daily cron) selects every estimate
-- expiring within the next 3 days with no "already notified" tracking, so
-- a single estimate gets a separate reminder email on every day it falls
-- in that window — 4 emails (day -3, -2, -1, 0) instead of one. Track when
-- the reminder was sent and skip estimates already notified.
alter table estimates
  add column expiry_notified_at timestamptz;
