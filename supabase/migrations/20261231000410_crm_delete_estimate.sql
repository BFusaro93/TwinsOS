-- Deleting an estimate, as one transaction.
--
-- The browser used to soft-delete the estimate and then try to switch off
-- what still pointed at it, with separate writes that could not all succeed:
--
--  * follow-up sequences were "stopped" by writing status = 'stopped', but
--    every sender decides on stopped_at / completed_at / deleted_at, so the
--    sequence kept emailing the client about an estimate that no longer
--    existed;
--  * queued automation step approvals for the estimate stayed pending, and a
--    user session may not reject them directly (enforce_sequence_step_approval_write);
--  * pending approval requests stayed in approvers' queues;
--  * a deposit still clearing (an ACH debit sits in `processing` for days and
--    writes no crm_payments row until it settles) did not block the delete,
--    so the money later landed against a deleted estimate.
--
-- crm_delete_estimate is SECURITY INVOKER on purpose: the soft delete itself
-- runs as the caller, so RLS on estimates and enforce_estimate_write_permission
-- (estimate_edit, or estimate_add on your own unsent draft) stay the single
-- authority on who may delete. Only the two narrow helpers below run as
-- definer, and each re-checks the caller's org:
--
--  _estimate_delete_blockers  read-only; raises when jobs, invoices, contracts,
--                             payments, projects or change orders were made
--                             from the estimate, or a deposit is still
--                             processing. Locks the estimate row so a deposit
--                             can't start clearing between the check and the
--                             delete.
--  _estimate_delete_cleanup   only acts on an estimate that is ALREADY deleted:
--                             proposal links, sequences, step approvals,
--                             approval requests.

create or replace function public._estimate_delete_blockers(p_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est record;
  v_parts text[] := array[]::text[];
  v_n integer;
begin
  select id, org_id, deleted_at, deposit_pending_cents, deposit_pending_intent_id
    into v_est
  from public.estimates
  where id = p_estimate_id
  for update;

  if not found or v_est.deleted_at is not null or public._org_mismatch(v_est.org_id) then
    raise exception 'That estimate was already deleted or you don''t have permission to delete it.'
      using errcode = 'P0002';
  end if;

  if coalesce(v_est.deposit_pending_cents, 0) > 0 or v_est.deposit_pending_intent_id is not null then
    raise exception 'This estimate can''t be deleted while its deposit% is still processing. Bank transfers take a few business days — delete it once the deposit has cleared or failed.',
      case when coalesce(v_est.deposit_pending_cents, 0) > 0
        then ' of $' || to_char(v_est.deposit_pending_cents / 100.0, 'FM999,999,990.00')
        else '' end
      using errcode = 'P0001';
  end if;

  select count(*) into v_n from public.crm_jobs
   where estimate_id = p_estimate_id and deleted_at is null and status is distinct from 'cancelled';
  if v_n > 0 then v_parts := v_parts || (v_n || ' job' || case when v_n > 1 then 's' else '' end); end if;

  select count(*) into v_n from public.crm_invoices
   where estimate_id = p_estimate_id and deleted_at is null and status is distinct from 'void';
  if v_n > 0 then v_parts := v_parts || (v_n || ' invoice' || case when v_n > 1 then 's' else '' end); end if;

  select count(*) into v_n from public.crm_contracts
   where estimate_id = p_estimate_id and deleted_at is null;
  if v_n > 0 then v_parts := v_parts || (v_n || ' contract' || case when v_n > 1 then 's' else '' end); end if;

  select count(*) into v_n from public.crm_payments
   where estimate_id = p_estimate_id and deleted_at is null;
  if v_n > 0 then v_parts := v_parts || (v_n || ' payment' || case when v_n > 1 then 's' else '' end); end if;

  select count(*) into v_n from public.projects
   where source_estimate_id = p_estimate_id and deleted_at is null;
  if v_n > 0 then v_parts := v_parts || (v_n || ' project' || case when v_n > 1 then 's' else '' end); end if;

  select count(*) into v_n from public.project_change_orders
   where estimate_id = p_estimate_id and deleted_at is null;
  if v_n > 0 then v_parts := v_parts || (v_n || ' change order' || case when v_n > 1 then 's' else '' end); end if;

  if array_length(v_parts, 1) > 0 then
    raise exception 'This estimate can''t be deleted — it has % made from it. Cancel or delete those first.',
      array_to_string(v_parts, ', ')
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public._estimate_delete_cleanup(p_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est record;
  v_now timestamptz := now();
begin
  select id, org_id, deleted_at into v_est
  from public.estimates
  where id = p_estimate_id;

  -- Only ever tidies up after an estimate that is already gone, in your org.
  if not found or v_est.deleted_at is null or public._org_mismatch(v_est.org_id) then
    return;
  end if;

  -- Proposal links stop working.
  update public.estimate_share_tokens
     set deleted_at = v_now
   where estimate_id = p_estimate_id and deleted_at is null;

  -- Follow-up sequences stop. The senders key on stopped_at, so that is what
  -- must be set; status follows for the lists that show it.
  update public.crm_sequence_enrollments
     set status = 'stopped',
         stopped_at = v_now,
         awaiting_approval = false
   where estimate_id = p_estimate_id
     and stopped_at is null
     and completed_at is null
     and deleted_at is null;

  -- Messages for this estimate waiting on someone's approval are never sent.
  update public.crm_sequence_step_approvals
     set status = 'rejected',
         decided_by = auth.uid(),
         decided_at = v_now
   where estimate_id = p_estimate_id
     and status = 'pending';

  -- Approval requests leave approvers' queues (kept, archived, for the audit trail).
  update public.approval_requests
     set status = 'superseded',
         archived = true,
         decided_at = v_now,
         comment = coalesce(nullif(comment, ''), 'Estimate deleted')
   where entity_type = 'crm_estimate'
     and entity_id = p_estimate_id
     and status = 'pending'
     and not archived;
end;
$$;

create or replace function public.crm_delete_estimate(p_estimate_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in to delete an estimate' using errcode = '42501';
  end if;

  perform public._estimate_delete_blockers(p_estimate_id);

  -- As the caller: RLS and enforce_estimate_write_permission decide.
  update public.estimates
     set deleted_at = now()
   where id = p_estimate_id
     and deleted_at is null;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'That estimate was already deleted or you don''t have permission to delete it.'
      using errcode = 'P0002';
  end if;

  perform public._estimate_delete_cleanup(p_estimate_id);
end;
$$;

revoke all on function public._estimate_delete_blockers(uuid) from public, anon;
revoke all on function public._estimate_delete_cleanup(uuid) from public, anon;
revoke all on function public.crm_delete_estimate(uuid) from public, anon;
grant execute on function public._estimate_delete_blockers(uuid) to authenticated, service_role;
grant execute on function public._estimate_delete_cleanup(uuid) to authenticated, service_role;
grant execute on function public.crm_delete_estimate(uuid) to authenticated, service_role;
