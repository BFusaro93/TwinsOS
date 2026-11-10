-- ============================================================
-- Projects: Delete vs Cancel (owner decision, bug sweep r10).
--
-- * Delete is refused once the project has billing or purchasing history: a live (non-void)
--   invoice, an open purchase order with a line on it, or an invoiced milestone. Deleting such a
--   project orphaned its invoices' project link and its PO cost from every report. The message
--   points at Cancel. Restoring a deleted project is not offered, so this is the only guard.
-- * Cancelling a project removes (soft-deletes) its PENDING billing milestones, so nothing on a
--   canceled job can still be invoiced from the schedule. Invoiced milestones stay as history.
--   Its upcoming visits are offered for cancellation in the app (/api/crm/projects/upcoming-
--   visits), the same Yes/No question cancelling a client asks.
-- ============================================================

create or replace function public.fn_projects_guard_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id      uuid := coalesce(new.id, old.id);
  v_inv     integer;
  v_po      integer;
  v_ms      integer;
  v_reasons text[] := '{}';
begin
  if tg_op = 'UPDATE' and not (new.deleted_at is not null and old.deleted_at is null) then
    return new;
  end if;

  select count(*) into v_inv
    from public.crm_invoices i
   where i.project_id = v_id and i.deleted_at is null and i.status <> 'void';
  select count(distinct po.id) into v_po
    from public.po_line_items li
    join public.purchase_orders po on po.id = li.po_id
   where li.project_id = v_id
     and po.deleted_at is null
     and po.status in ('requested', 'pending', 'approved', 'ordered', 'partially_fulfilled');
  select count(*) into v_ms
    from public.estimate_milestones m
   where m.project_id = v_id and m.deleted_at is null and m.status = 'invoiced';

  if v_inv > 0 then v_reasons := v_reasons || format('%s invoice%s', v_inv, case when v_inv = 1 then '' else 's' end); end if;
  if v_po > 0 then v_reasons := v_reasons || format('%s open purchase order%s', v_po, case when v_po = 1 then '' else 's' end); end if;
  if v_ms > 0 then v_reasons := v_reasons || format('%s invoiced milestone%s', v_ms, case when v_ms = 1 then '' else 's' end); end if;

  if cardinality(v_reasons) > 0 then
    raise exception 'This project can''t be deleted because it has %. Cancel the project instead — it keeps its billing and purchasing history.',
      array_to_string(v_reasons, ', ')
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_projects_guard_delete on public.projects;
create trigger trg_projects_guard_delete
  before update of deleted_at or delete on public.projects
  for each row execute function public.fn_projects_guard_delete();

create or replace function public.fn_projects_cancel_pending_milestones()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    update public.estimate_milestones
       set deleted_at = now()
     where project_id = new.id
       and status = 'pending'
       and deleted_at is null;
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_projects_cancel_pending_milestones on public.projects;
create trigger trg_projects_cancel_pending_milestones
  after update of status on public.projects
  for each row execute function public.fn_projects_cancel_pending_milestones();

-- Trigger-only SECURITY DEFINER functions: not callable through the API (firing a trigger
-- doesn't check EXECUTE), matching fn_project_change_orders_guard.
revoke all on function public.fn_projects_guard_delete() from public, anon, authenticated;
revoke all on function public.fn_projects_cancel_pending_milestones() from public, anon, authenticated;
