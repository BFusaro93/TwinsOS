-- Round 14 (equipt F4, part 2 of 2): no direct SELECT of employee contact
-- details for end users.
--
-- APPLY AFTER THE DEPLOY (and after 20270106000150). The app reads these
-- columns only through crm_list_employees() / crm_employee_contacts() /
-- rpt_employees (all updated in 20270106000150), so this is belt-and-braces:
-- it stops a direct PostgREST read (select=phone,... on crm_employees) from
-- any session, crew and Equipt-only logins included.
--
-- crm_employees already uses column-level SELECT grants (pay, I-9, licence
-- and PIN columns were revoked earlier). Names, ids, email, role/link and
-- scheduling columns stay readable for pickers (WO/PM assignees, crews,
-- sales reps). INSERT/UPDATE privileges are unchanged (the row policies still
-- require emp_add / emp_edit), but an insert/update that asks for the row
-- back must list only readable columns (the app returns "id" only).

revoke select (
  address, city, zip,
  phone, cell_phone,
  emergency_contact, emergency_phone,
  notes, manager_id,
  starting_address, starting_city, starting_state, starting_zip,
  starting_lat, starting_lng
) on public.crm_employees from anon, authenticated;

notify pgrst, 'reload schema';
