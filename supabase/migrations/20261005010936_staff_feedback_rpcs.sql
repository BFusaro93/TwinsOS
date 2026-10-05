-- Staff feedback inbox: narrow RPCs instead of blanket "staff can read/write
-- the feedback table" policies. Returns org and submitter names (which RLS
-- would hide across orgs) and lets staff change only the triage status.
DROP POLICY IF EXISTS "staff can read all feedback" ON public.feedback;
DROP POLICY IF EXISTS "staff can triage all feedback" ON public.feedback;

CREATE OR REPLACE FUNCTION public.staff_list_feedback()
RETURNS TABLE(
  id uuid, org_id uuid, org_name text, category text, message text, page_url text,
  user_agent text, screenshot_path text, status text, created_at timestamptz,
  submitter_name text, submitter_email text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.org_id, o.name, f.category, f.message, f.page_url,
         f.user_agent, f.screenshot_path, f.status, f.created_at,
         p.name, p.email
    FROM public.feedback f
    LEFT JOIN public.organizations o ON o.id = f.org_id
    LEFT JOIN public.profiles p ON p.id = f.created_by
   WHERE public.is_staff(auth.uid())
   ORDER BY f.created_at DESC
   LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.staff_set_feedback_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_status NOT IN ('new', 'reviewed', 'closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.feedback SET status = p_status WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_list_feedback() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_set_feedback_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_list_feedback() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_feedback_status(uuid, text) TO authenticated;
