-- AddReadingDialog.tsx has always shown an optional "Notes" textarea when
-- logging a meter reading, but meter_readings never had a column for it —
-- useAddMeterReading's insert doesn't even reference the field, so whatever
-- a user typed was silently discarded on submit. Add the column and wire up
-- the write.

ALTER TABLE public.meter_readings ADD COLUMN IF NOT EXISTS notes text;
