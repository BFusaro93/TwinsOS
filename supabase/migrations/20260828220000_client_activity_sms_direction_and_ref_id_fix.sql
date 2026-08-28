-- Fixes a real bug: client_activity.ref_id is uuid, but Twilio message SIDs
-- (e.g. "SM6dd733713285d5e419dd5e1a03bfea98") aren't valid UUIDs, so every
-- SMS send's activity-log insert (src/lib/sms/send.ts) has been silently
-- failing on the ref_id column since the SMS feature launched — confirmed
-- zero activity_type='sms' rows exist despite real sends going out. No
-- constraint/FK/index depends on ref_id being uuid specifically (it's a
-- polymorphic ref_table/ref_id pair, not a real foreign key), so widening
-- to text is safe and preserves every existing uuid value's own string form.
ALTER TABLE client_activity ALTER COLUMN ref_id TYPE text USING ref_id::text;

-- Needed for a future inbound-message webhook to look up the activity row
-- a Twilio status callback (or inbound reply) is reporting on.
CREATE INDEX IF NOT EXISTS client_activity_ref_id_idx
  ON client_activity (ref_id) WHERE ref_id IS NOT NULL;

-- Distinguishes an inbound SMS reply from an outbound send in the same
-- table. NULL means "outbound" (the implicit default for every existing
-- row and every other activity_type, which are all one-directional today).
ALTER TABLE client_activity
  ADD COLUMN IF NOT EXISTS direction text
    CHECK (direction IN ('inbound', 'outbound') OR direction IS NULL);
