-- 1. A severity below first aid: the person was hurt but no first aid or
--    medical treatment was given (reported for the record only).
ALTER TABLE public.injury_cases DROP CONSTRAINT IF EXISTS injury_cases_severity_check;
ALTER TABLE public.injury_cases ADD CONSTRAINT injury_cases_severity_check
  CHECK (severity IN ('no_treatment', 'first_aid', 'medical_treatment', 'lost_time', 'fatality'));

-- 2. Link an injury case to a real employee so it shows on their profile.
--    employee_name stays as the person as reported (and for people with no
--    employee record); employee_id is the optional link.
ALTER TABLE public.injury_cases
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.crm_employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS injury_cases_employee_id_idx
  ON public.injury_cases (employee_id) WHERE employee_id IS NOT NULL;

-- Backfill existing cases where the typed name matches exactly one employee in
-- the same org. Ambiguous or unmatched names are left unlinked. Audit is
-- suppressed so the backfill doesn't appear as a user edit on every case.
DO $$
BEGIN
  PERFORM set_config('app.suppress_audit', 'true', true);
  UPDATE public.injury_cases ic
     SET employee_id = m.employee_id
    FROM (
      SELECT ic2.id AS case_id, (array_agg(e.id))[1] AS employee_id
        FROM public.injury_cases ic2
        JOIN public.crm_employees e
          ON e.org_id = ic2.org_id
         AND e.deleted_at IS NULL
         AND lower(btrim(e.first_name || ' ' || e.last_name)) = lower(btrim(ic2.employee_name))
       WHERE ic2.employee_id IS NULL
       GROUP BY ic2.id
      HAVING count(*) = 1
    ) m
   WHERE ic.id = m.case_id;
END $$;
