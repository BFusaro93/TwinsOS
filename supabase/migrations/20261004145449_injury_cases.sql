-- Injury cases: employee injury reports, mirroring damage_cases.
-- Powers the Injury Cases list/dashboard (days since last injury, open/closed)
-- and the field "Injury Report" form under Job Photos > Field.

CREATE TABLE public.injury_cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL DEFAULT my_org_id() REFERENCES public.organizations(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id),
  deleted_at       timestamptz,

  case_number      text NOT NULL,  -- IC-2026-001
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  severity         text NOT NULL DEFAULT 'first_aid'
                   CHECK (severity IN ('first_aid', 'medical_treatment', 'lost_time')),

  employee_name    text NOT NULL,
  date_of_incident date NOT NULL,
  location         text,
  injury_type      text,
  body_part        text,
  description      text NOT NULL,
  treatment        text,
  days_away        integer NOT NULL DEFAULT 0 CHECK (days_away >= 0),
  recordable       boolean NOT NULL DEFAULT false,
  resolution_notes text,

  CONSTRAINT injury_cases_case_number_org_unique UNIQUE (org_id, case_number)
);

CREATE INDEX injury_cases_org_date_idx ON public.injury_cases (org_id, date_of_incident DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE public.injury_case_counters (
  org_id    uuid NOT NULL REFERENCES public.organizations(id),
  case_year text NOT NULL,
  count     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, case_year)
);
ALTER TABLE public.injury_case_counters ENABLE ROW LEVEL SECURITY;
-- Deny-all by design: only next_injury_case_number() (SECURITY DEFINER) touches it.

CREATE OR REPLACE FUNCTION public.next_injury_case_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   text := to_char(now(), 'YYYY');
  v_org_id uuid := my_org_id();
  v_count  int;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  INSERT INTO public.injury_case_counters (org_id, case_year, count)
  VALUES (v_org_id, v_year, 1)
  ON CONFLICT (org_id, case_year)
    DO UPDATE SET count = public.injury_case_counters.count + 1
  RETURNING count INTO v_count;
  RETURN 'IC-' || v_year || '-' || lpad(v_count::text, 3, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_injury_case_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_injury_case_number() TO authenticated;

ALTER TABLE public.injury_cases ENABLE ROW LEVEL SECURITY;

-- Injury records are sensitive: org members only, never client-portal logins.
CREATE POLICY "org members can manage injury_cases" ON public.injury_cases
  FOR ALL
  USING (org_id = my_org_id() AND NOT is_client_portal_user())
  WITH CHECK (org_id = my_org_id() AND NOT is_client_portal_user());

-- Same canceled-subscription read-only guard every other table carries.
CREATE POLICY read_only_when_canceled_ins ON public.injury_cases AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_upd ON public.injury_cases AS RESTRICTIVE FOR UPDATE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_del ON public.injury_cases AS RESTRICTIVE FOR DELETE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);

CREATE TRIGGER set_injury_cases_updated_at
  BEFORE UPDATE ON public.injury_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Comments / attachments: re-state the live CHECK lists plus 'injury_case'.
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_record_type_check;
ALTER TABLE public.comments ADD CONSTRAINT comments_record_type_check
  CHECK (record_type IN ('requisition','po','receiving','project','work_order','job_photo',
                         'damage_case','ticket','crm_estimate','injury_case'));

ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_record_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_record_type_check
  CHECK (record_type IN ('requisition','po','receiving','project','work_order','request','vehicle',
                         'asset','vendor','ticket','damage_case','contract','estimate','job',
                         'injury_case'));
