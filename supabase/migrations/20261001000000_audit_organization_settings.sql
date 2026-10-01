-- ============================================================
-- Audit trail for organization settings.
--
-- Nothing recorded edits to the `organizations` row, so changes to the labor
-- rates, tax rate, branding, payment options, portal toggle, timezone, etc.
-- left no trace (found 2026-09-30 while investigating which break-even / LLR
-- rate a project was using and who had set it).
--
-- A dedicated small trigger function is used instead of extending the very
-- large fn_audit_log: the organizations row is the only table whose "fields"
-- are mostly keys inside one JSONB column (`customizations`), so it needs a
-- per-key diff that the generic differ does not do.
--
-- One audit_log row per UPDATE, record_type 'organization', record_id = the
-- org id. Each changed column — and each changed key inside `customizations`
-- — is narrated through fn_audit_format_change, so *_cents keys render as
-- dollars and long JSON blobs collapse to "<key> changed". Derived or
-- system-owned columns are skipped; provider ids/sids are narrated as
-- "changed (value hidden)".
--
-- Visibility: 'organization' joins the admin/manager-only record types in the
-- audit_log SELECT policy (settings changes include billing and payment
-- configuration, which ordinary members have no need to read). Holders of the
-- audit-report permissions can read them too, exactly as for Security rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r_old        jsonb;
  r_new        jsonb;
  v_key        text;
  v_sub        text;
  v_label      text;
  v_parts      text[] := '{}';
  v_user_id    uuid;
  v_user_name  text;
  -- Columns that change as a side effect, not because someone edited settings.
  v_skip constant text[] := array['updated_at', 'account_number_next'];
begin
  if coalesce(current_setting('app.suppress_audit', true), '') = 'true' then
    return NEW;
  end if;

  r_old := to_jsonb(OLD);
  r_new := to_jsonb(NEW);

  for v_key in select jsonb_object_keys(r_new) loop
    continue when v_key = any (v_skip);
    continue when r_old -> v_key is not distinct from r_new -> v_key;

    if v_key = 'customizations' then
      -- Per-key diff across the union of old and new keys.
      for v_sub in
        select k from (
          select jsonb_object_keys(coalesce(r_old -> 'customizations', '{}'::jsonb)) as k
          union
          select jsonb_object_keys(coalesce(r_new -> 'customizations', '{}'::jsonb))
        ) s order by k
      loop
        continue when (r_old -> 'customizations' -> v_sub)
          is not distinct from (r_new -> 'customizations' -> v_sub);
        -- camelCase -> snake_case so the *_cents / *_bps money conventions in
        -- fn_audit_format_change apply (breakevenLaborRateCents -> ..._cents).
        v_label := lower(regexp_replace(v_sub, '([a-z0-9])([A-Z])', '\1_\2', 'g'));
        v_parts := v_parts || fn_audit_format_change(
          v_label,
          r_old -> 'customizations' ->> v_sub,
          r_new -> 'customizations' ->> v_sub
        );
      end loop;

    elsif v_key ~ '^(stripe|twilio)_' and v_key !~ '(status|enabled|livemode)$' then
      -- Provider identifiers: record that they changed, never the value.
      v_parts := v_parts || (replace(v_key, '_', ' ') || ' changed (value hidden)');

    else
      v_parts := v_parts || fn_audit_format_change(
        v_key, r_old ->> v_key, r_new ->> v_key
      );
    end if;
  end loop;

  -- Only skipped / derived columns moved.
  if coalesce(array_length(v_parts, 1), 0) = 0 then
    return NEW;
  end if;

  begin
    select id, coalesce(name, email, id::text)
    into v_user_id, v_user_name
    from profiles
    where id = auth.uid();
  exception when others then
    v_user_id   := null;
    v_user_name := null;
  end;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description
  ) values (
    NEW.id, v_user_id, 'organization', NEW.id, 'updated',
    -- No session = a webhook / cron / service-role write.
    coalesce(v_user_name, 'System'),
    left('Organization settings updated — ' || array_to_string(v_parts, '; '), 2000)
  );

  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_audit_organizations ON public.organizations;
CREATE TRIGGER trg_audit_organizations
  AFTER UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_organization();

-- Direct execution is for the trigger only.
REVOKE ALL ON FUNCTION public.fn_audit_organization() FROM PUBLIC, anon, authenticated;

-- ── audit_log SELECT: add 'organization' to the restricted record types ──────
-- Restated from the live policy (pg_policy, 2026-09-30), one element added.
drop policy if exists org_members_read_audit_log on public.audit_log;
create policy org_members_read_audit_log on public.audit_log
  for select
  using (
    org_id = (select public.my_org_id())
    and (
      record_type <> all (array['employee','user','role','api_key','integration','oauth_token','organization'])
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
