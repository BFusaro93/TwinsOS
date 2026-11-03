-- Text client custom fields (e.g. "Mulch Color") can be overridden per property too.
--
-- 20261207000800 gave every NUMBER client field a linked property def so a property can carry
-- its own value (the client's value is the default). A client with two properties needs the
-- same for descriptive fields — two different mulch colors — so text fields get the same
-- linked def. The pickers that need a number (Rate Matrix lookup, chemical Area) already
-- filter to field_type = 'number', and the dispatch board skips linked defs, so a text copy
-- shows only in the Edit Property dialog.

create or replace function fn_sync_client_field_to_property_field()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.field_type in ('number', 'text') and NEW.deleted_at is null then
    update crm_rate_matrix_field_defs
       set field_label = NEW.name,
           field_type  = NEW.field_type,
           sort_order  = 100 + NEW.sort_order,
           deleted_at  = null
     where client_field_def_id = NEW.id;
    if not found then
      insert into crm_rate_matrix_field_defs
        (org_id, entity_type, field_key, field_label, field_type, sort_order, client_field_def_id)
      values
        (NEW.org_id, 'property', 'client_field_' || NEW.id, NEW.name, NEW.field_type, 100 + NEW.sort_order, NEW.id);
    end if;
  else
    update crm_rate_matrix_field_defs
       set deleted_at = now()
     where client_field_def_id = NEW.id and deleted_at is null;
  end if;
  return NEW;
end;
$$;

-- Existing text fields.
insert into crm_rate_matrix_field_defs
  (org_id, entity_type, field_key, field_label, field_type, sort_order, client_field_def_id)
select d.org_id, 'property', 'client_field_' || d.id, d.name, 'text', 100 + d.sort_order, d.id
from crm_custom_field_defs d
where d.field_type = 'text'
  and d.deleted_at is null
  and not exists (
    select 1 from crm_rate_matrix_field_defs m
    where m.client_field_def_id = d.id and m.deleted_at is null
  );
