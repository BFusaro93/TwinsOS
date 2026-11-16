-- Work orders are deleted only through delete_work_order (bug sweep round 14).
--
-- delete_work_order (20270106000230) decides what happens to the parts on the
-- tree — always returned for open / skipped WOs, returned for a Done WO only
-- when the user says they went back on the shelf. Without this guard an end
-- user could still set work_orders.deleted_at directly and skip that rule
-- (and the sub-WO cascade).
--
-- The trigger refuses a direct end-user soft delete (deleted_at NULL → set)
-- unless the transaction-local GUC app.wo_delete_rpc = 'on', which only
-- delete_work_order sets. Service-role writes (PM generation rollback, the
-- public API), SECURITY DEFINER functions and trigger cascades are exempt
-- (_crm_direct_user_write() is false for them). Restoring a deleted WO is
-- not affected.
--
-- DEPLOY: AFTER the code deploy. The old client soft-deletes work orders with
-- a direct UPDATE; applied before the new code ships, deleting a work order
-- from the old UI would fail.

create or replace function public.work_orders_soft_delete_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and public._crm_direct_user_write()
     and coalesce(current_setting('app.wo_delete_rpc', true), '') <> 'on' then
    raise exception 'Delete work orders with the Delete button, which also handles the parts used on them.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_work_orders_soft_delete_guard on public.work_orders;
create trigger trg_work_orders_soft_delete_guard
  before update of deleted_at on public.work_orders
  for each row execute function public.work_orders_soft_delete_guard();
