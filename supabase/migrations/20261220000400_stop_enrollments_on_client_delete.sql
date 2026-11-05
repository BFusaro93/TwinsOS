-- Deleting (soft-deleting) a client ends every automation sequence still running for
-- them. Before this, an in-flight enrollment kept going: its email/SMS steps were
-- skipped (the merge-var loader refuses a deleted client) but the ticket, alert,
-- field-update and tag steps after them still ran against the deleted record. The
-- processor now also stops these at execution time (stopped_client_deleted); this
-- trigger makes the enrollment show as stopped right away, whichever path deleted the
-- client (Clients page, bulk, API, merge).
create or replace function public.stop_enrollments_on_client_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.crm_sequence_enrollments
       set stopped_at = now(), updated_at = now()
     where client_id = new.id
       and org_id = new.org_id
       and completed_at is null
       and stopped_at is null
       and deleted_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.stop_enrollments_on_client_delete() from public, anon, authenticated;

drop trigger if exists stop_enrollments_on_client_delete on public.clients;
create trigger stop_enrollments_on_client_delete
  after update of deleted_at on public.clients
  for each row execute function public.stop_enrollments_on_client_delete();
