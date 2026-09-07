-- E-02: New Clients Report showed Castillo "Client Since Sep 6" although the
-- lead converted 9/5 10:04 PM ET (2026-09-06 02:04Z).
--
-- Root cause: the pre-f278a4b4 write paths stamped client_since with the UTC
-- calendar date (toISOString().slice(0,10)) — evenings in Eastern time roll
-- into the next UTC day. The app code now uses isoNy() everywhere it writes
-- client_since (use-clients.ts convert, api/v1/clients, zapier, forms) and the
-- 20260906130000 data fix only touched rows that were NULL, so accounts
-- stamped before the fix still carry the shifted date. The read side
-- (rpt_clients.client_since, a plain `date`) is fine — no view change needed.
--
-- One-time data fix: where client_since equals the UTC date of created_at but
-- NOT the Eastern date of created_at (i.e. the account was created in the
-- evening ET and stamped the same evening), move it back to the Eastern date.
-- Rows whose client_since was set later (a real conversion on a later day) are
-- untouched because they don't match the UTC-date-of-created_at signature.
--
-- Expected sandbox: Owen & Priya Castillo (262e6210-…) client_since 2026-09-06
-- → 2026-09-05. 8 rows matched across PROD at the time of writing.

update clients
   set client_since = (created_at at time zone 'America/New_York')::date
 where deleted_at is null
   and client_since is not null
   and client_since = (created_at at time zone 'UTC')::date
   and client_since <> (created_at at time zone 'America/New_York')::date;
