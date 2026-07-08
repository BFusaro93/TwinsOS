-- crm_services.category had a CHECK constraint from 20260617000003 allowing
-- ('lawn','fertilization','snow','construction','irrigation','cleanup','general'),
-- but ServiceDialog's category dropdown offers a different, never-synced set
-- ('lawn','landscape','snow','irrigation','tree','chemical','other'). Only
-- 'lawn'/'snow'/'irrigation' overlapped, so every other category silently
-- failed to save. Also, there was no Settings UI to manage the category list.
--
-- Fix: drop the fixed CHECK constraint and make categories a dynamic
-- crm_list_options list (list_name = 'service_categories'), matching the
-- pattern already used for ticket_categories, client_sources, etc. Seed the
-- org with the categories ServiceDialog already offered so existing UI
-- behavior doesn't change, just becomes editable.

alter table crm_services drop constraint if exists crm_services_category_check;

insert into crm_list_options (org_id, list_name, value, sort_order)
select o.id, 'service_categories', v.value, v.ord
from organizations o
cross join (values
  ('lawn', 0),
  ('landscape', 1),
  ('snow', 2),
  ('irrigation', 3),
  ('tree', 4),
  ('chemical', 5),
  ('other', 6)
) as v(value, ord)
on conflict (org_id, list_name, value) do nothing;
