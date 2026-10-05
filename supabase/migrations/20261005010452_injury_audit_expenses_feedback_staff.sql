-- 1. Injury cases: claim route + self-pay expenses
-- 2. Injury cases: audit trail (dedicated trigger, record_type 'injury_case')
-- 3. Staff (platform support org) can read/triage feedback from every org

-- ── 1. Claim route + expenses ────────────────────────────────────────────────
ALTER TABLE public.injury_cases
  ADD COLUMN IF NOT EXISTS claim_route text
  CHECK (claim_route IN ('workers_comp', 'self_pay'));

CREATE TABLE public.injury_case_expenses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL DEFAULT my_org_id() REFERENCES public.organizations(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id),
  deleted_at       timestamptz,

  injury_case_id   uuid NOT NULL REFERENCES public.injury_cases(id),
  expense_date     date NOT NULL,
  expense_type     text NOT NULL DEFAULT 'medical'
                   CHECK (expense_type IN ('medical', 'lost_wages', 'other')),
  vendor_id        uuid REFERENCES public.vendors(id),
  vendor_name      text,
  description      text NOT NULL,
  amount           integer NOT NULL DEFAULT 0 CHECK (amount >= 0),  -- cents
  purchase_order_id uuid REFERENCES public.purchase_orders(id)
);

CREATE INDEX injury_case_expenses_case_idx ON public.injury_case_expenses (injury_case_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.injury_case_expenses ENABLE ROW LEVEL SECURITY;

-- The parent check stops a guessed injury_case_id from another org being
-- attached to this org's expense row.
CREATE POLICY "org members can manage injury_case_expenses" ON public.injury_case_expenses
  FOR ALL
  USING (org_id = my_org_id() AND NOT is_client_portal_user())
  WITH CHECK (
    org_id = my_org_id() AND NOT is_client_portal_user()
    AND EXISTS (SELECT 1 FROM public.injury_cases c
                 WHERE c.id = injury_case_id AND c.org_id = my_org_id())
  );
CREATE POLICY read_only_when_canceled_ins ON public.injury_case_expenses AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_upd ON public.injury_case_expenses AS RESTRICTIVE FOR UPDATE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_del ON public.injury_case_expenses AS RESTRICTIVE FOR DELETE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);

CREATE TRIGGER set_injury_case_expenses_updated_at
  BEFORE UPDATE ON public.injury_case_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Same PO-belongs-to-this-org guard damage cases use (reads only
-- NEW.purchase_order_id / NEW.org_id).
CREATE TRIGGER trg_guard_injury_case_expense_po_org_match
  BEFORE INSERT OR UPDATE ON public.injury_case_expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_case_po_org_match();

-- ── 2. Audit trail ───────────────────────────────────────────────────────────
-- A dedicated function instead of extending the shared fn_audit_log: that
-- function is replaced wholesale by many migrations and drifts between
-- environments, and the shared one would write record_type 'injury_cases'
-- with a uuid for a title. Expenses roll up onto the injury case so they show
-- in the case's Audit Trail tab.
CREATE OR REPLACE FUNCTION public.fn_audit_injury()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r_old       jsonb;
  r_new       jsonb;
  v_org_id    uuid;
  v_case_id   uuid;
  v_user_id   uuid;
  v_user_name text;
  v_action    text;
  v_desc      text;
  v_old_val   text;
  v_new_val   text;
  v_title     text;
  v_lead      text;
  v_key       text;
  v_parts     text[] := array[]::text[];
  v_skip      text[] := array['updated_at','created_at','id','created_by','org_id',
                              'deleted_at','case_number','injury_case_id'];
  v_cost_note text := '';
BEGIN
  IF coalesce(current_setting('app.suppress_audit', true), '') = 'true' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  r_old := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  r_new := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  v_org_id := coalesce((r_new ->> 'org_id')::uuid, (r_old ->> 'org_id')::uuid);
  IF v_org_id IS NULL THEN RETURN coalesce(NEW, OLD); END IF;

  -- Attribution: the signed-in user; on INSERT fall back to created_by.
  BEGIN
    SELECT id, coalesce(name, email, id::text) INTO v_user_id, v_user_name
      FROM profiles WHERE id = auth.uid();
  EXCEPTION WHEN others THEN
    v_user_id := NULL; v_user_name := NULL;
  END;
  IF v_user_name IS NULL AND TG_OP = 'INSERT' THEN
    BEGIN
      SELECT id, coalesce(name, email, id::text) INTO v_user_id, v_user_name
        FROM profiles WHERE id = (r_new ->> 'created_by')::uuid;
    EXCEPTION WHEN others THEN
      v_user_id := NULL; v_user_name := NULL;
    END;
  END IF;
  v_user_name := coalesce(v_user_name, 'system');

  IF TG_TABLE_NAME = 'injury_case_expenses' THEN
    v_case_id   := coalesce((r_new ->> 'injury_case_id')::uuid, (r_old ->> 'injury_case_id')::uuid);
    v_title     := coalesce(nullif(r_new ->> 'description', ''), nullif(r_old ->> 'description', ''), 'expense');
    v_cost_note := ' — $' || to_char(coalesce((r_new ->> 'amount')::numeric, (r_old ->> 'amount')::numeric, 0) / 100.0, 'FM999999990.00');

    IF TG_OP = 'INSERT' THEN
      v_action := 'created';
      v_desc   := 'Expense added: ' || v_title || v_cost_note;
    ELSIF TG_OP = 'DELETE'
       OR ((r_old ->> 'deleted_at') IS NULL AND (r_new ->> 'deleted_at') IS NOT NULL) THEN
      v_action := 'deleted';
      v_desc   := 'Expense removed: ' || v_title || v_cost_note;
    ELSE
      FOR v_key IN SELECT jsonb_object_keys(r_new) LOOP
        CONTINUE WHEN v_key = any(v_skip);
        IF (r_old ->> v_key) IS DISTINCT FROM (r_new ->> v_key) THEN
          -- `amount` is cents but isn't named *_cents, so format it by hand.
          v_parts := v_parts || CASE WHEN v_key = 'amount'
            THEN 'amount: $' || to_char((r_old ->> 'amount')::numeric / 100.0, 'FM999999990.00')
                 || ' → $' || to_char((r_new ->> 'amount')::numeric / 100.0, 'FM999999990.00')
            ELSE fn_audit_format_change(v_key, r_old ->> v_key, r_new ->> v_key) END;
        END IF;
      END LOOP;
      v_parts := array_remove(v_parts, NULL);
      IF array_length(v_parts, 1) IS NULL THEN RETURN coalesce(NEW, OLD); END IF;
      v_action := 'updated';
      v_desc   := 'Expense ' || v_title || ' updated — ' || array_to_string(v_parts, '; ');
    END IF;

  ELSE  -- injury_cases
    v_case_id := coalesce((r_new ->> 'id')::uuid, (r_old ->> 'id')::uuid);
    v_title   := coalesce(r_new ->> 'case_number', r_old ->> 'case_number', '')
                 || coalesce(' (' || nullif(coalesce(r_new ->> 'employee_name', r_old ->> 'employee_name'), '') || ')', '');

    IF TG_OP = 'INSERT' THEN
      v_action := 'created';
      v_desc   := 'Injury case created: ' || v_title;
    ELSIF TG_OP = 'DELETE'
       OR ((r_old ->> 'deleted_at') IS NULL AND (r_new ->> 'deleted_at') IS NOT NULL) THEN
      v_action := 'deleted';
      v_desc   := 'Injury case deleted: ' || v_title;
    ELSE
      v_action := 'updated';
      IF (r_old ->> 'status') IS DISTINCT FROM (r_new ->> 'status') THEN
        v_action  := 'status_changed';
        v_lead    := 'Status: ' || coalesce(r_old ->> 'status', '?') || ' → ' || coalesce(r_new ->> 'status', '?');
        v_old_val := r_old ->> 'status';
        v_new_val := r_new ->> 'status';
        v_skip    := v_skip || 'status'::text;
      END IF;
      FOR v_key IN SELECT jsonb_object_keys(r_new) LOOP
        CONTINUE WHEN v_key = any(v_skip);
        IF (r_old ->> v_key) IS DISTINCT FROM (r_new ->> v_key) THEN
          v_parts := v_parts || fn_audit_format_change(v_key, r_old ->> v_key, r_new ->> v_key);
        END IF;
      END LOOP;
      v_parts := array_remove(v_parts, NULL);
      IF v_lead IS NULL AND array_length(v_parts, 1) IS NULL THEN RETURN coalesce(NEW, OLD); END IF;
      v_desc := CASE
        WHEN v_lead IS NULL THEN 'Injury case updated — ' || array_to_string(v_parts, '; ')
        WHEN array_length(v_parts, 1) IS NULL THEN v_lead
        ELSE v_lead || '; ' || array_to_string(v_parts, '; ')
      END;
    END IF;
  END IF;

  INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action,
                                changed_by_name, description, old_value, new_value)
  VALUES (v_org_id, v_user_id, 'injury_case', v_case_id, v_action,
          v_user_name, v_desc, v_old_val, v_new_val);

  RETURN coalesce(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_audit_injury() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_injury_cases_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.injury_cases
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_injury();
CREATE TRIGGER trg_injury_case_expenses_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.injury_case_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_injury();

-- ── 3. Staff can triage feedback from every org ──────────────────────────────
CREATE POLICY "staff can read all feedback" ON public.feedback
  FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "staff can triage all feedback" ON public.feedback
  FOR UPDATE USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Screenshots live under {org_id}/…; staff need to read other orgs' folders.
CREATE POLICY "staff_read_feedback_screenshots" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND public.is_staff(auth.uid()));
