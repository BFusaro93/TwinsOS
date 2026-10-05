-- Align injury cases with the Twins "Employee's Report of Injury" intake form:
-- report type (injury / illness / near miss), the intake questions, and the
-- investigation outcome fields. Near misses are tracked but are not injuries.
ALTER TABLE public.injury_cases
  ADD COLUMN IF NOT EXISTS incident_type text NOT NULL DEFAULT 'injury'
    CHECK (incident_type IN ('injury', 'illness', 'near_miss')),
  ADD COLUMN IF NOT EXISTS time_of_incident time,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS supervisor_name text,
  ADD COLUMN IF NOT EXISTS told_supervisor boolean,
  ADD COLUMN IF NOT EXISTS witnesses text,
  ADD COLUMN IF NOT EXISTS activity text,
  ADD COLUMN IF NOT EXISTS prevention_suggestion text,
  ADD COLUMN IF NOT EXISTS saw_doctor boolean,
  ADD COLUMN IF NOT EXISTS doctor_name text,
  ADD COLUMN IF NOT EXISTS doctor_phone text,
  ADD COLUMN IF NOT EXISTS doctor_visit_date date,
  ADD COLUMN IF NOT EXISTS previously_injured boolean,
  ADD COLUMN IF NOT EXISTS ppe_used text,
  ADD COLUMN IF NOT EXISTS equipment_involved text,
  ADD COLUMN IF NOT EXISTS cause text,
  ADD COLUMN IF NOT EXISTS corrective_action text;

-- A near miss has no injury severity; add 'fatality' to match the form's
-- Death / Lost Time / Dr. Visit Only / First Aid Only scale.
ALTER TABLE public.injury_cases ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE public.injury_cases DROP CONSTRAINT IF EXISTS injury_cases_severity_check;
ALTER TABLE public.injury_cases ADD CONSTRAINT injury_cases_severity_check
  CHECK (severity IN ('first_aid', 'medical_treatment', 'lost_time', 'fatality'));
ALTER TABLE public.injury_cases ADD CONSTRAINT injury_cases_severity_required_check
  CHECK (incident_type = 'near_miss' OR severity IS NOT NULL);
