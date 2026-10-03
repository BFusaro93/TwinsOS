-- Approval flow integrity.
--   1. One live flow per (org, entity_type). useApprovalFlow() uses
--      .maybeSingle() and submit_for_approval() used LIMIT 1 with no ORDER BY,
--      so a duplicate flow made approval routing nondeterministic. Index is
--      created only when no duplicates exist (otherwise NOTICE; resolve the
--      duplicates by soft-deleting the extras and re-run).
--   2. submit_for_approval: deterministic flow pick (ORDER BY created_at, id)
--      and a step whose assigned_user is no longer an active member of the
--      org falls back to the step's role-based approver resolution instead of
--      creating an approval request for a deactivated user nobody can act on
--      (which stranded the record in pending_approval).
-- The function is patched in place from its LIVE definition (the body has
-- been revised by several migrations), idempotently.

do $$
begin
  if exists (
    select 1 from public.approval_flows
     where deleted_at is null
     group by org_id, entity_type
    having count(*) > 1
  ) then
    raise notice 'approval_flows has duplicate live flows per (org_id, entity_type); skipping unique index approval_flows_live_org_entity_uidx — soft-delete the extras and re-run';
  else
    create unique index if not exists approval_flows_live_org_entity_uidx
      on public.approval_flows (org_id, entity_type)
      where deleted_at is null;
  end if;
end $$;

do $$
declare
  def text := pg_get_functiondef('public.submit_for_approval(text, uuid)'::regprocedure);
  new_def text := def;
  flow_old text := E'WHERE org_id = v_org AND entity_type = p_entity_type AND deleted_at IS NULL\n   LIMIT 1;';
  flow_new text := E'WHERE org_id = v_org AND entity_type = p_entity_type AND deleted_at IS NULL\n   ORDER BY created_at, id\n   LIMIT 1;';
  user_old text := E'IF v_step.assigned_user_id IS NOT NULL THEN';
  user_new text := E'IF v_step.assigned_user_id IS NOT NULL\n         AND EXISTS (SELECT 1 FROM public.profiles pa\n                      WHERE pa.id = v_step.assigned_user_id AND pa.org_id = v_org AND pa.status = ''active'') THEN';
begin
  if position('ORDER BY created_at, id' in def) = 0 then
    if position(flow_old in def) = 0 then
      raise exception 'submit_for_approval flow lookup anchor not found';
    end if;
    new_def := replace(new_def, flow_old, flow_new);
  end if;
  if position('pa.status = ''active''' in def) = 0 then
    if position(user_old in def) = 0 then
      raise exception 'submit_for_approval assigned_user anchor not found';
    end if;
    new_def := replace(new_def, user_old, user_new);
  end if;
  if new_def <> def then
    execute new_def;
  end if;
end $$;

revoke all on function public.submit_for_approval(text, uuid) from public, anon;
grant execute on function public.submit_for_approval(text, uuid) to authenticated;
