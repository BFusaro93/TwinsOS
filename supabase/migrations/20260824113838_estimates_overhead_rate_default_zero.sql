-- estimates.overhead_rate_bps defaulted to 1500 (15.00%) — an arbitrary
-- number seeded on the table's original creation
-- (20260623000009_crm_estimates_schema.sql) with no corresponding org
-- setting or calculation behind it. Every new estimate silently got a
-- "15%" shown in its Financial Settings panel that nobody configured and
-- that looked identical to a deliberately-chosen rate, which is exactly
-- what caused confusion when per-type overhead was active (the flat rate
-- was being ignored entirely, so the 15% appeared to do nothing) and would
-- otherwise start silently applying a real 15% markup to every future
-- estimate now that per-type overhead has been zeroed out org-wide.
--
-- New estimates now default to 0% flat overhead — explicit opt-in only,
-- either per-estimate (Financial Settings) or org-wide (Overhead Recovery
-- settings). Existing estimates are untouched; this only changes the
-- default applied on future inserts.

ALTER TABLE public.estimates
  ALTER COLUMN overhead_rate_bps SET DEFAULT 0;
