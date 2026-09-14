-- pm_schedules.assigned_to_id/assigned_to_name exist on the live database as
-- untracked schema drift (no migration file adds them). The column carries
-- an FK to auth.users(id) — i.e. it holds a profile/login id — but the
-- picker that sets it (NewPMScheduleDialog) also only offers profiles, and
-- /api/pm-schedules/[id]/generate-wo copies the value verbatim into
-- work_orders.assigned_to_id, whose FK was repointed to crm_employees(id)
-- in 20260825134105_sales_rep_assigned_to_fk_target_employees.sql. That
-- migration never touched pm_schedules, so every PM schedule with a default
-- assignee now fails work_orders_assigned_to_id_fkey on generation.
--
-- Same fix, same pattern: drop the old auth.users-targeting FK, backfill
-- assigned_to_id from the profile id it currently holds to the matching
-- crm_employees.id (via user_id), drop unmatched values to null, then add
-- the FK targeting crm_employees(id) so this can't drift again.

alter table pm_schedules drop constraint if exists pm_schedules_assigned_to_id_fkey;

update pm_schedules ps set assigned_to_id = ce.id
from crm_employees ce
where ce.user_id = ps.assigned_to_id and ce.org_id = ps.org_id;

update pm_schedules set assigned_to_id = null
where assigned_to_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = pm_schedules.assigned_to_id);

alter table pm_schedules
  add constraint pm_schedules_assigned_to_id_fkey
  foreign key (assigned_to_id) references crm_employees(id) on delete set null;
