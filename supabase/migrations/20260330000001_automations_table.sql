CREATE TABLE public.automations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  enabled          boolean     NOT NULL DEFAULT true,
  trigger_type     text        NOT NULL CHECK (trigger_type IN ('meter_threshold','part_low_stock','pm_due','wo_overdue','request_submitted','wo_status_change','po_status_change')),
  trigger_config   jsonb       NOT NULL DEFAULT '{}',
  action_type      text        NOT NULL CHECK (action_type IN ('create_wo_request','create_requisition','send_notification','send_email')),
  action_config    jsonb       NOT NULL DEFAULT '{}',
  last_fired_at    timestamptz,
  last_fired_value numeric,
  pending_reset    boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES public.profiles(id),
  deleted_at       timestamptz
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_automations" ON public.automations
  FOR ALL USING (org_id = public.my_org_id()) WITH CHECK (org_id = public.my_org_id());

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS automation_id uuid REFERENCES public.automations(id);
