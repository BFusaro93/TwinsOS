-- Contract notes and estimate photos now require the same keys as the record
-- they belong to when written straight from an end-user session (exemptions
-- in 20261207000100; admins always pass).
--
--  crm_contract_notes  contract_edit, or contract_add on a draft the caller
--                      created — the Notes tab lives in the contract dialog,
--                      which opens for contract_edit (and for the creator of
--                      a new contract). Same rule as crm_contract_services.
--  estimate_photos     estimate_edit, or estimate_add on an unsent estimate
--                      the caller created — the estimate-child rule from
--                      20261207000300. The photo routes
--                      (/api/crm/estimates/[id]/photos) already require
--                      estimate_edit and write under the caller's session.
create or replace function public.enforce_crm_contract_note_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contract_ids uuid[];
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission('contract_edit') then
    return coalesce(new, old);
  end if;

  v_contract_ids := case tg_op
    when 'INSERT' then array[new.contract_id]
    when 'DELETE' then array[old.contract_id]
    else array[new.contract_id, old.contract_id]
  end;

  if public.has_settings_permission('contract_add')
     and not exists (
       select 1 from unnest(v_contract_ids) c(id)
       where not exists (
         select 1 from public.crm_contracts k
         where k.id = c.id
           and k.status = 'draft'
           and k.created_by = auth.uid()
           and k.deleted_at is null
       )
     ) then
    return coalesce(new, old);
  end if;

  raise exception 'You do not have permission to edit contracts'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_contract_notes_enforce_write_permission on public.crm_contract_notes;
create trigger a_crm_contract_notes_enforce_write_permission
  before insert or update or delete on public.crm_contract_notes
  for each row
  execute function public.enforce_crm_contract_note_write_permission();

drop trigger if exists a_estimate_photos_enforce_write_permission on public.estimate_photos;
create trigger a_estimate_photos_enforce_write_permission
  before insert or update or delete on public.estimate_photos
  for each row
  execute function public.enforce_estimate_child_write_permission();
