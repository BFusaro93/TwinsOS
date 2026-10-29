-- ticket_contributors identified people by display name ("First Last"), so
-- renaming an employee (or two employees sharing a name) silently broke
-- comment notifications and "my tickets". Identify them by crm_employees.id
-- instead, like crm_tickets.assigned_to_id. user_name stays for display and
-- for legacy rows whose name no longer matches exactly one employee.

ALTER TABLE public.ticket_contributors
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.crm_employees(id);

-- Backfill: only where the stored name matches exactly ONE live employee in
-- the same org; ambiguous or unmatched rows keep employee_id NULL.
UPDATE public.ticket_contributors tc
SET employee_id = m.employee_id
FROM (
  SELECT tc2.id AS contributor_id, (array_agg(e.id))[1] AS employee_id
  FROM public.ticket_contributors tc2
  JOIN public.crm_employees e
    ON e.org_id = tc2.org_id
   AND e.deleted_at IS NULL
   AND lower(btrim(e.first_name || ' ' || e.last_name)) = lower(btrim(tc2.user_name))
  WHERE tc2.employee_id IS NULL
  GROUP BY tc2.id
  HAVING count(*) = 1
) m
WHERE tc.id = m.contributor_id;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_contributors_ticket_employee_key
  ON public.ticket_contributors (ticket_id, employee_id)
  WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ticket_contributors_employee_id_idx
  ON public.ticket_contributors (employee_id);

-- The org-only RLS policies can't see across to crm_employees, so keep a
-- contributor from pointing at another org's employee.
CREATE OR REPLACE FUNCTION public.ticket_contributors_check_employee_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_employees e
    WHERE e.id = NEW.employee_id AND e.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'employee % does not belong to this organization', NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_contributors_check_employee_org ON public.ticket_contributors;
CREATE TRIGGER ticket_contributors_check_employee_org
  BEFORE INSERT OR UPDATE OF employee_id ON public.ticket_contributors
  FOR EACH ROW EXECUTE FUNCTION public.ticket_contributors_check_employee_org();
