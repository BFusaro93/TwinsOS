-- CRM access is being gated behind a linked crm_employees record (see the
-- application-level check added to the (crm) layout in the same change).
-- Today NO profiles row in any org is linked to a crm_employees record, so
-- flipping that gate on with no backfill would lock out every current
-- non-admin user. Create a crm_employees row for each existing non-admin,
-- non-crew profile and link it to their login, assigning the org's most
-- permissive existing crm_roles row ("Owner") so this is a no-op change in
-- practice — everyone keeps exactly the unrestricted access they have today.
-- Narrower CRM roles can be assigned per-person afterward in Team > Employees.
insert into crm_employees (org_id, first_name, last_name, email, user_id, crm_role_id, user_type, is_active)
select
  p.org_id,
  coalesce(split_part(p.name, ' ', 1), p.name) as first_name,
  coalesce(nullif(substring(p.name from position(' ' in p.name) + 1), ''), '') as last_name,
  p.email,
  p.id as user_id,
  r.id as crm_role_id,
  'full_user',
  true
from profiles p
join crm_roles r on r.org_id = p.org_id and r.name = 'Owner'
where p.role not in ('admin', 'crew')
  and not exists (
    select 1 from crm_employees e where e.user_id = p.id and e.deleted_at is null
  );
