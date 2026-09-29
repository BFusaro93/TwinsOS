-- PM schedule assignee changes never reached the audit trail.
--
-- fn_audit_log skips 'assigned_to_id' and 'assigned_to_name' for EVERY table.
-- That was written for work_orders/crm_tickets, which carry the change in the
-- denormalised assigned_to_names column. pm_schedules has only the id and the
-- name, so reassigning a schedule (e.g. Eric -> Casey) produced no entry at all.
--
-- For pm_schedules only, stop skipping assigned_to_name (readable) and keep
-- skipping the raw id (would just say "changed"). Patches the LIVE function
-- source in place because this function drifts (see audit trail notes); it
-- fails loudly if the anchor text is not found.
do $$
declare
  v_def  text;
  v_anchor constant text :=
    E'      if TG_TABLE_NAME <> ''profiles'' then\n        v_skip_keys := v_skip_keys || ''org_id''::text;\n      end if;\n';
  v_patch constant text := v_anchor ||
    E'\n      -- pm_schedules has no assigned_to_names; the name column IS the record.\n      if TG_TABLE_NAME = ''pm_schedules'' then\n        v_skip_keys := array_remove(v_skip_keys, ''assigned_to_name'');\n      end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  where p.proname = 'fn_audit_log' and p.pronamespace = 'public'::regnamespace;

  if position(v_anchor in v_def) = 0 then
    raise exception 'fn_audit_log anchor not found; restate the function in full instead';
  end if;
  if position('array_remove(v_skip_keys, ''assigned_to_name'')' in v_def) > 0 then
    return; -- already applied
  end if;

  execute replace(v_def, v_anchor, v_patch);
end $$;
