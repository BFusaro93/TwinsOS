-- ============================================================
-- Job Costing scenarios, persisted per org.
--
-- The Job Costing calculator held its inputs and its scenario list in React
-- state seeded from constants in the component (Twins' own 2026 budget). So:
--   * every org opened the calculator to Twins' numbers,
--   * scenarios vanished on reload, and
--   * "Set as project rate" was the only thing that ever reached the database.
--
-- A new org now starts with no scenarios. Exactly one scenario per org can be
-- flagged is_default; the calculator loads that one (or a blank form if none).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_costing_scenarios (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL DEFAULT public.my_org_id() REFERENCES public.organizations(id),
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),
  -- The calculator's input set (wage, hours, burden %, overhead, ...). Kept as
  -- JSONB so adding an input never needs a migration; the app validates shape.
  inputs      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        DEFAULT auth.uid() REFERENCES public.profiles(id),
  deleted_at  timestamptz
);

-- At most one live default per org.
CREATE UNIQUE INDEX IF NOT EXISTS job_costing_scenarios_one_default
  ON public.job_costing_scenarios (org_id)
  WHERE is_default AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS job_costing_scenarios_org_idx
  ON public.job_costing_scenarios (org_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_job_costing_scenarios_updated_at ON public.job_costing_scenarios;
CREATE TRIGGER trg_job_costing_scenarios_updated_at
  BEFORE UPDATE ON public.job_costing_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.job_costing_scenarios ENABLE ROW LEVEL SECURITY;

-- Anyone in the org who can open Job Costing can read the scenarios.
-- Customers on the client portal are org members too, so exclude them.
CREATE POLICY job_costing_scenarios_select ON public.job_costing_scenarios
  FOR SELECT
  USING (org_id = (select public.my_org_id()) AND NOT (select public.is_client_portal_user()));

-- Writes follow the same gate as the other costing configuration
-- (crm_overhead_settings): the accounting-settings permission, or admin/manager.
CREATE POLICY job_costing_scenarios_write ON public.job_costing_scenarios
  FOR ALL
  USING (
    org_id = (select public.my_org_id())
    AND NOT (select public.is_client_portal_user())
    AND (
      (select public.my_role()) IN ('admin', 'manager')
      OR (select public.has_settings_permission('accounting_settings'))
      OR (select public.has_settings_permission('company_settings'))
    )
  )
  WITH CHECK (
    org_id = (select public.my_org_id())
    AND NOT (select public.is_client_portal_user())
    AND (
      (select public.my_role()) IN ('admin', 'manager')
      OR (select public.has_settings_permission('accounting_settings'))
      OR (select public.has_settings_permission('company_settings'))
    )
  );

-- A canceled org is read-only, like every other table.
CREATE POLICY read_only_when_canceled_ins ON public.job_costing_scenarios
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((select public.my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_upd ON public.job_costing_scenarios
  AS RESTRICTIVE FOR UPDATE
  USING ((select public.my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_del ON public.job_costing_scenarios
  AS RESTRICTIVE FOR DELETE
  USING ((select public.my_org_is_read_only()) IS NOT TRUE);

-- ── Atomic "make this the default" ───────────────────────────────────────────
-- Two statements (clear old, set new) would trip the one-default index if run
-- as separate client calls, and could leave an org with none if the second
-- failed. SECURITY INVOKER so the write policy above still applies.
-- p_id NULL clears the default (calculator goes back to blank).
CREATE OR REPLACE FUNCTION public.set_default_job_costing_scenario(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.my_org_id();
begin
  if v_org is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_id is not null and not exists (
    select 1 from job_costing_scenarios
    where id = p_id and org_id = v_org and deleted_at is null
  ) then
    raise exception 'Scenario not found' using errcode = 'P0002';
  end if;

  update job_costing_scenarios
     set is_default = false
   where org_id = v_org and is_default and deleted_at is null
     and id is distinct from p_id;

  if p_id is not null then
    update job_costing_scenarios set is_default = true
     where id = p_id and org_id = v_org and not is_default;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_default_job_costing_scenario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_job_costing_scenario(uuid) TO authenticated;

-- ── Audit ────────────────────────────────────────────────────────────────────
-- Scenario inputs drive the rates saved to projects, so who changed them and
-- when matters. Dedicated small function (see 20261001000000 for why).
CREATE OR REPLACE FUNCTION public.fn_audit_job_costing_scenario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r_old        jsonb;
  r_new        jsonb;
  v_sub        text;
  v_parts      text[] := '{}';
  v_action     text := 'updated';
  v_desc       text;
  v_user_id    uuid;
  v_user_name  text;
  v_name       text := coalesce(NEW.name, OLD.name);
begin
  if coalesce(current_setting('app.suppress_audit', true), '') = 'true' then
    return coalesce(NEW, OLD);
  end if;

  begin
    select id, coalesce(name, email, id::text)
    into v_user_id, v_user_name
    from profiles
    where id = auth.uid();
  exception when others then
    v_user_id := null; v_user_name := null;
  end;

  if TG_OP = 'INSERT' then
    v_action := 'created';
    v_desc   := 'Job costing scenario created: ' || v_name;

  else
    r_old := to_jsonb(OLD);
    r_new := to_jsonb(NEW);

    if OLD.deleted_at is null and NEW.deleted_at is not null then
      v_action := 'deleted';
      v_desc   := 'Job costing scenario deleted: ' || v_name;
    else
      if OLD.name is distinct from NEW.name then
        v_parts := v_parts || ('name: ' || OLD.name || ' → ' || NEW.name);
      end if;
      if OLD.is_default is distinct from NEW.is_default then
        v_parts := v_parts || (case when NEW.is_default then 'set as the default scenario'
                                    else 'no longer the default scenario' end);
      end if;
      for v_sub in
        select k from (
          select jsonb_object_keys(coalesce(OLD.inputs, '{}'::jsonb)) as k
          union
          select jsonb_object_keys(coalesce(NEW.inputs, '{}'::jsonb))
        ) s order by k
      loop
        continue when (OLD.inputs -> v_sub) is not distinct from (NEW.inputs -> v_sub);
        v_parts := v_parts || fn_audit_format_change(
          lower(regexp_replace(v_sub, '([a-z0-9])([A-Z])', '\1_\2', 'g')),
          OLD.inputs ->> v_sub,
          NEW.inputs ->> v_sub
        );
      end loop;

      if coalesce(array_length(v_parts, 1), 0) = 0 then
        return NEW;
      end if;
      v_desc := 'Job costing scenario "' || v_name || '" updated — ' || array_to_string(v_parts, '; ');
    end if;
  end if;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action, changed_by_name, description
  ) values (
    coalesce(NEW.org_id, OLD.org_id), v_user_id, 'job_costing_scenario',
    coalesce(NEW.id, OLD.id), v_action, coalesce(v_user_name, 'System'), left(v_desc, 2000)
  );

  return coalesce(NEW, OLD);
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_audit_job_costing_scenario() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_job_costing_scenarios ON public.job_costing_scenarios;
CREATE TRIGGER trg_audit_job_costing_scenarios
  AFTER INSERT OR UPDATE ON public.job_costing_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_job_costing_scenario();

-- Scenario rows hold company cost structure; keep their trail with the other
-- admin/manager-only record types.
drop policy if exists org_members_read_audit_log on public.audit_log;
create policy org_members_read_audit_log on public.audit_log
  for select
  using (
    org_id = (select public.my_org_id())
    and (
      record_type <> all (array['employee','user','role','api_key','integration','oauth_token','organization','job_costing_scenario'])
      or (select public.my_role()) in ('admin', 'manager')
      or (select public.has_settings_permission('admin_rpt_audit_log'))
      or (select public.has_settings_permission('admin_rpt_security_audit'))
      or (
        record_type = 'employee'
        and (
          (select public.has_settings_permission('payroll_show_pay_rate'))
          or (select public.has_settings_permission('emp_edit'))
        )
      )
    )
  );
