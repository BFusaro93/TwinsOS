-- Numeric client custom fields double as property fields.
--
-- The Rate Matrix lookup and the chemical area measurement key off
-- crm_rate_matrix_field_defs (property-level defs), but the Custom Fields
-- screen only creates crm_custom_field_defs (client-level), so a numeric field
-- you created could never drive a matrix or an area. Each number client field
-- now gets a linked property def (client_field_def_id), kept in sync by
-- trigger. Values resolve property first, then the client's value (see
-- src/lib/chemical-area.ts), the same way the built-in takeoffs do.

alter table crm_rate_matrix_field_defs
  add column if not exists client_field_def_id uuid references crm_custom_field_defs(id);

create unique index if not exists crm_rate_matrix_field_defs_client_field_uidx
  on crm_rate_matrix_field_defs (client_field_def_id)
  where client_field_def_id is not null and deleted_at is null;

create or replace function fn_sync_client_field_to_property_field()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.field_type = 'number' and NEW.deleted_at is null then
    update crm_rate_matrix_field_defs
       set field_label = NEW.name, sort_order = 100 + NEW.sort_order, deleted_at = null
     where client_field_def_id = NEW.id;
    if not found then
      insert into crm_rate_matrix_field_defs
        (org_id, entity_type, field_key, field_label, field_type, sort_order, client_field_def_id)
      values
        (NEW.org_id, 'property', 'client_field_' || NEW.id, NEW.name, 'number', 100 + NEW.sort_order, NEW.id);
    end if;
  else
    update crm_rate_matrix_field_defs
       set deleted_at = now()
     where client_field_def_id = NEW.id and deleted_at is null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_client_field_to_property_field on crm_custom_field_defs;
create trigger trg_sync_client_field_to_property_field
  after insert or update of name, field_type, sort_order, deleted_at on crm_custom_field_defs
  for each row execute function fn_sync_client_field_to_property_field();

-- Backfill: every existing number client field gets its property def.
insert into crm_rate_matrix_field_defs
  (org_id, entity_type, field_key, field_label, field_type, sort_order, client_field_def_id)
select d.org_id, 'property', 'client_field_' || d.id, d.name, 'number', 100 + d.sort_order, d.id
from crm_custom_field_defs d
where d.field_type = 'number'
  and d.deleted_at is null
  and not exists (
    select 1 from crm_rate_matrix_field_defs m
    where m.client_field_def_id = d.id and m.deleted_at is null
  );
