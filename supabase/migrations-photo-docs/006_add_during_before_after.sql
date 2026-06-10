-- Add 'during' as a valid value for job_photos.before_after

ALTER TABLE job_photos
  DROP CONSTRAINT IF EXISTS job_photos_before_after_check,
  ADD CONSTRAINT job_photos_before_after_check
    CHECK (before_after IN ('before', 'during', 'after', 'none'));
