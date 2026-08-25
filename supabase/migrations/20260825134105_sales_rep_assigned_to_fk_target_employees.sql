-- Repoint sales_rep_id / assigned_to_id FKs from profiles(id) (login users)
-- to crm_employees(id) (actual staff records).
--
-- Background: 20260714004620_sales_rep_fk_target_profiles.sql and
-- 20260714004626_estimates_sales_rep_fk_target_profiles.sql deliberately
-- pointed sales_rep_id at profiles so a rep's identity could be tied to a
-- real login (for commission/user-identity tracking). In practice this
-- backfires: most real sales reps and field technicians (crm_employees rows
-- with is_sales_rep=true, or ordinary crew) have no profiles/login row at
-- all, so they can never be selected in the sales-rep or work-order-assignee
-- pickers. crm_employees.user_id already links an employee to their login
-- when one exists (added in 20260706123936_crm_crews_details.sql), so
-- pointing these FKs at crm_employees(id) instead keeps that identity link
-- available (join through user_id when needed) while letting every real
-- staff member be assigned, logged in or not.
--
-- 20260716145749_backfill_crm_employee_links.sql created a crm_employees
-- row for every login except admins ("where p.role not in ('admin',
-- 'crew')"), so most org owners/admins were never linked either. Close that
-- gap first so admin-held sales-rep assignments survive the backfill below.

-- Step 1: link any remaining admin profiles to their crm_employees row by
-- exact name match, but only where the match is unambiguous (one employee,
-- one profile) to avoid mis-linking.
with unlinked_admins as (
  select p.id as profile_id, p.org_id, p.name as profile_name
  from profiles p
  where p.role = 'admin'
    and not exists (select 1 from crm_employees e where e.user_id = p.id)
),
unambiguous as (
  select ua.profile_id, ua.org_id, ua.profile_name, ce.id as employee_id
  from unlinked_admins ua
  join crm_employees ce
    on ce.org_id = ua.org_id
   and ce.user_id is null
   and ce.deleted_at is null
   and lower(trim(ce.first_name || ' ' || coalesce(ce.last_name, ''))) = lower(trim(ua.profile_name))
  where (
    select count(*) from crm_employees ce2
    where ce2.org_id = ua.org_id and ce2.user_id is null and ce2.deleted_at is null
      and lower(trim(ce2.first_name || ' ' || coalesce(ce2.last_name, ''))) = lower(trim(ua.profile_name))
  ) = 1
)
update crm_employees ce
set user_id = u.profile_id
from unambiguous u
where ce.id = u.employee_id;

-- Step 1b: drop the old profiles-targeting FKs before backfilling, so the
-- intermediate writes below (employee ids into columns still checked
-- against profiles) don't get rejected.

alter table clients drop constraint if exists clients_sales_rep_id_fkey;
alter table estimates drop constraint if exists estimates_sales_rep_id_fkey;
alter table crm_jobs drop constraint if exists crm_jobs_sales_rep_id_fkey;
alter table crm_contracts drop constraint if exists crm_contracts_sales_rep_id_fkey;
alter table crm_invoices drop constraint if exists crm_invoices_sales_rep_id_fkey;
alter table work_orders drop constraint if exists work_orders_assigned_to_id_fkey;
alter table crm_tickets drop constraint if exists crm_tickets_assigned_to_id_fkey;

-- Step 2: sales_rep_id columns (clients, estimates, crm_jobs, crm_contracts,
-- crm_invoices). Backfill each non-null value from the profile id it
-- currently holds to the matching crm_employees.id (via user_id); rows with
-- no matching employee become NULL rather than pointing at a dangling id.

update clients c set sales_rep_id = ce.id
from crm_employees ce
where ce.user_id = c.sales_rep_id and ce.org_id = c.org_id;
update clients set sales_rep_id = null
where sales_rep_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = clients.sales_rep_id);

update estimates e set sales_rep_id = ce.id
from crm_employees ce
where ce.user_id = e.sales_rep_id and ce.org_id = e.org_id;
update estimates set sales_rep_id = null
where sales_rep_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = estimates.sales_rep_id);

update crm_jobs j set sales_rep_id = ce.id
from crm_employees ce
where ce.user_id = j.sales_rep_id and ce.org_id = j.org_id;
update crm_jobs set sales_rep_id = null
where sales_rep_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = crm_jobs.sales_rep_id);

update crm_contracts ct set sales_rep_id = ce.id
from crm_employees ce
where ce.user_id = ct.sales_rep_id and ce.org_id = ct.org_id;
update crm_contracts set sales_rep_id = null
where sales_rep_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = crm_contracts.sales_rep_id);

update crm_invoices i set sales_rep_id = ce.id
from crm_employees ce
where ce.user_id = i.sales_rep_id and ce.org_id = i.org_id;
update crm_invoices set sales_rep_id = null
where sales_rep_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = crm_invoices.sales_rep_id);

-- Step 3: assigned_to_id (work_orders, crm_tickets), same pattern.

update work_orders w set assigned_to_id = ce.id
from crm_employees ce
where ce.user_id = w.assigned_to_id and ce.org_id = w.org_id;
update work_orders set assigned_to_id = null
where assigned_to_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = work_orders.assigned_to_id);

update crm_tickets t set assigned_to_id = ce.id
from crm_employees ce
where ce.user_id = t.assigned_to_id and ce.org_id = t.org_id;
update crm_tickets set assigned_to_id = null
where assigned_to_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = crm_tickets.assigned_to_id);

-- Step 4: work_orders.assigned_to_ids is a jsonb array of ids (no FK
-- possible on jsonb elements), but the app will now treat its elements as
-- crm_employees ids too — convert in place for consistency. Unmatched
-- elements are dropped rather than left pointing at a profile id.
update work_orders w
set assigned_to_ids = coalesce((
  select jsonb_agg(ce.id)
  from jsonb_array_elements_text(w.assigned_to_ids) as elem(profile_id)
  join crm_employees ce on ce.user_id = elem.profile_id::uuid and ce.org_id = w.org_id
), '[]'::jsonb)
where jsonb_array_length(w.assigned_to_ids) > 0;

-- Step 5: add the new FKs targeting crm_employees(id) (old ones already
-- dropped in step 1b).

alter table clients add constraint clients_sales_rep_id_fkey
  foreign key (sales_rep_id) references crm_employees(id);

alter table estimates add constraint estimates_sales_rep_id_fkey
  foreign key (sales_rep_id) references crm_employees(id);

alter table crm_jobs add constraint crm_jobs_sales_rep_id_fkey
  foreign key (sales_rep_id) references crm_employees(id);

alter table crm_contracts add constraint crm_contracts_sales_rep_id_fkey
  foreign key (sales_rep_id) references crm_employees(id);

alter table crm_invoices add constraint crm_invoices_sales_rep_id_fkey
  foreign key (sales_rep_id) references crm_employees(id);

alter table work_orders add constraint work_orders_assigned_to_id_fkey
  foreign key (assigned_to_id) references crm_employees(id);

alter table crm_tickets add constraint crm_tickets_assigned_to_id_fkey
  foreign key (assigned_to_id) references crm_employees(id);
