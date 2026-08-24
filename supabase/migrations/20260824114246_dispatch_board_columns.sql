-- Dispatch board: add missing columns to crm_job_visits
alter table crm_job_visits
  add column if not exists sub_status          text,
  add column if not exists order_num           integer,
  add column if not exists men_count           integer not null default 0,
  add column if not exists qty                 numeric(10,2),
  add column if not exists rate_cents          integer,
  add column if not exists notes_to_client     text,
  add column if not exists invoice_description text,
  add column if not exists job_comments        jsonb not null default '[]',
  add column if not exists assigned_employee_id uuid references crm_employees(id) on delete set null,
  add column if not exists dispatched_at       timestamptz;

-- Add 'dispatched' to the status check constraint
alter table crm_job_visits
  drop constraint if exists crm_job_visits_status_check;
alter table crm_job_visits
  add constraint crm_job_visits_status_check
    check (status in ('scheduled','dispatched','in_progress','completed','cancelled','skipped'));

-- ── Crew-level job visibility ──────────────────────────────────────────────────
-- Field employees (user_type = 'field') can only see visits for their crew(s).
-- Org admins, managers, and full users see all visits (existing policy covers them).

-- Drop the broad select policy and replace with a role-aware one
drop policy if exists "org members select visits" on crm_job_visits;

create policy "crew members see own visits"
  on crm_job_visits for select
  using (
    org_id = (select org_id from profiles where id = auth.uid())
    and (
      -- admins and non-field users see everything
      exists (
        select 1 from crm_employees e
        where e.user_id = auth.uid()
          and e.is_active = true
          and e.user_type <> 'field'
      )
      -- OR no employee record linked (org admin via profiles table role)
      or not exists (
        select 1 from crm_employees where user_id = auth.uid()
      )
      -- OR field users see visits for crews they belong to
      or crew_id in (
        select cm.crew_id
        from crm_crew_members cm
        join crm_employees e on e.id = cm.employee_id
        where e.user_id = auth.uid()
          and e.is_active = true
      )
    )
  );
