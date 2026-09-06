-- client_since means "date the account became a client", not "date the lead was entered".
--
-- The lead-creation paths used to stamp client_since = today on every new LEAD,
-- lead-to-client conversion never touched it, and form/Zapier/API-created
-- accounts never set it at all, so every "new client" / "days to convert"
-- metric was wrong. The app code changes alongside this migration (leads no
-- longer get client_since; conversion sets it; direct client creation sets it).
--
-- This one-time data fix:
--   * clears client_since on accounts that are still leads or were lost as leads
--   * sets client_since = created_at for clients that never had one
-- Accounts that converted before this fix keep their lead-entry date (the true
-- conversion date is not recoverable).
update clients
   set client_since = null
 where deleted_at is null
   and status in ('lead', 'lost')
   and client_since is not null;

update clients
   set client_since = (created_at at time zone 'America/New_York')::date
 where deleted_at is null
   and status in ('active', 'inactive', 'cancelled')
   and client_since is null;
