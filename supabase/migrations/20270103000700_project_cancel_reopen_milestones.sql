-- Projects: reopening a canceled project can bring back the billing milestones the cancel removed.
--
-- Cancelling a project soft-deletes its PENDING billing milestones
-- (trg_projects_cancel_pending_milestones). Reopening only flipped the status back, so the removed
-- milestones were gone for good and the project had nothing left to bill (audit r13 F4).
--
-- Owner decision (r13): reopening ASKS whether to restore exactly the milestones that cancel
-- removed, re-balanced against the current contract price.
--
--   * estimate_milestones.canceled_with_project_at — set on exactly the rows the cancel removed.
--     A new cancel first clears markers left by an earlier cancel, so only the latest batch can
--     come back.
--   * projects.cancel_unscheduled_cents — at cancel time, how much of the contract the billing
--     schedule did NOT cover (contract − schedule). Restoring puts the schedule back in the same
--     relationship to the CURRENT contract: if the contract moved while the project was canceled
--     (an original-price edit, a change order reversed), the difference is spread across the
--     restored milestones, pro rata, never below zero. Nothing changed → the rows come back
--     exactly as they were. Set only by the system (a direct write to it is ignored).
--   * reopen_canceled_project(p_project_id, p_restore_milestones) — reopens (status 'sold') and,
--     when asked, restores + re-balances, in one transaction. Needs the projects key
--     (sched_add_modify_projects), the same key the cancel question needs.
--
-- reverse_change_order (20270103000710) unwinds its billing_allocation on cancel-marked rows too,
-- so a change order reversed while the project is canceled is taken off exactly the milestones it
-- was added to, and the restore then has nothing left to re-balance for it.
--
-- PROD: apply BEFORE the code deploy (the new Reopen dialog calls reopen_canceled_project). Old
-- code is unaffected: its Reopen does a plain status update, which leaves the markers in place
-- (harmless; the next cancel clears them).

alter table public.estimate_milestones
  add column if not exists canceled_with_project_at timestamptz;

comment on column public.estimate_milestones.canceled_with_project_at is
  'Set when cancelling the project soft-deleted this pending milestone; reopen_canceled_project() can restore exactly these rows. Cleared on restore and by the next cancel.';

alter table public.projects
  add column if not exists cancel_unscheduled_cents integer;

comment on column public.projects.cancel_unscheduled_cents is
  'System-set while the project is canceled: contract price minus the billing schedule at the moment it was canceled. reopen_canceled_project() re-balances restored milestones so the schedule keeps this gap against the current contract.';

-- ── helper: what the live billing schedule adds up to, on the contract's basis ──────────────
-- Same per-row figure _approve_change_order uses for a pending row (a percent row on its own
-- basis; a flat row carried from a TAXED estimate brought to the estimate's net share on a
-- pre-tax project). An invoiced percent row is frozen at its billed amount_cents.
create or replace function public._project_milestone_current_cents(p_milestone_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type    text;
  v_status  text;
  v_amount  integer;
  v_est     uuid;
  v_is_pre  boolean;
  v_pretax  boolean := false;
  v_total   integer;
  v_tax     integer;
  v_pct     integer;
begin
  select m.milestone_type, m.status, coalesce(m.amount_cents, 0), m.estimate_id,
         coalesce(m.amount_is_pretax, false), coalesce(p.contract_price_is_pretax, false),
         e.total_cents, e.tax_cents
    into v_type, v_status, v_amount, v_est, v_is_pre, v_pretax, v_total, v_tax
    from public.estimate_milestones m
    left join public.projects p on p.id = m.project_id
    left join public.estimates e on e.id = m.estimate_id
   where m.id = p_milestone_id;
  if not found then
    return 0;
  end if;

  if v_type = 'percent' then
    if v_status = 'pending' then
      v_pct := public._milestone_percent_amount_cents(p_milestone_id);
      if v_pct is not null then
        return v_pct;
      end if;
    end if;
    return v_amount;
  end if;

  if v_pretax and v_est is not null and not v_is_pre
     and coalesce(v_total, 0) > 0 and coalesce(v_tax, 0) > 0 then
    return round(v_amount::numeric * (v_total - v_tax) / v_total)::integer;
  end if;
  return v_amount;
end;
$$;

revoke all on function public._project_milestone_current_cents(uuid) from public, anon, authenticated;

create or replace function public._project_milestone_schedule_cents(p_project_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public._project_milestone_current_cents(m.id)), 0)::bigint
    from public.estimate_milestones m
   where m.project_id = p_project_id
     and m.deleted_at is null;
$$;

revoke all on function public._project_milestone_schedule_cents(uuid) from public, anon, authenticated;

-- ── BEFORE UPDATE: snapshot the uncovered part of the contract at cancel ──────────────────
create or replace function public.fn_projects_cancel_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- System-set only, and only by the cancel / reopen transition itself: any other write to the
  -- column (an API update, an insert) is ignored, so nobody can inflate what a restore adds back.
  if tg_op = 'INSERT' then
    new.cancel_unscheduled_cents := null;
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    -- Milestones are still live here (the AFTER trigger removes them). Both figures are the
    -- pre-update state, so an original-price edit in the same statement can't skew the gap.
    new.cancel_unscheduled_cents :=
      (coalesce(old.contract_price, 0) - public._project_milestone_schedule_cents(new.id))::integer;
  elsif old.status = 'canceled' and new.status is distinct from 'canceled' then
    new.cancel_unscheduled_cents := null;
  else
    new.cancel_unscheduled_cents := old.cancel_unscheduled_cents;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_projects_cancel_snapshot() from public, anon, authenticated;

drop trigger if exists trg_projects_cancel_snapshot on public.projects;
create trigger trg_projects_cancel_snapshot
  before insert or update on public.projects
  for each row execute function public.fn_projects_cancel_snapshot();

-- ── AFTER UPDATE OF status: remove pending milestones, marking exactly those rows ─────────
create or replace function public.fn_projects_cancel_pending_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    -- Rows an earlier cancel removed (and a reopen chose not to restore) stay removed for good.
    update public.estimate_milestones
       set canceled_with_project_at = null
     where project_id = new.id
       and canceled_with_project_at is not null;

    update public.estimate_milestones
       set deleted_at = v_now,
           canceled_with_project_at = v_now
     where project_id = new.id
       and status = 'pending'
       and deleted_at is null;
  end if;
  return null;
end;
$$;

-- ── reopen_canceled_project ─────────────────────────────────────────────────────────────────
create or replace function public.reopen_canceled_project(
  p_project_id uuid,
  p_restore_milestones boolean default true
)
returns table (restored_count integer, adjusted_cents integer, unabsorbed_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org        uuid;
  v_status     text;
  v_deleted    timestamptz;
  v_pretax     boolean;
  v_gap0       integer;
  v_contract   integer;
  v_ids        uuid[];
  v_rows       jsonb;
  v_count      integer := 0;
  v_total      bigint := 0;
  v_adjust     bigint := 0;
  v_allocated  bigint := 0;
  v_share      bigint;
  v_cents      integer;
  v_idx        integer := 0;
  v_n          integer;
  r            jsonb;
begin
  -- The projects key: the same one the cancel question (and editing project milestones) needs.
  if not coalesce(public.has_settings_permission('sched_add_modify_projects'), false) then
    raise exception 'You do not have permission to reopen this project'
      using errcode = '42501';
  end if;
  -- Mirror the projects table's restrictive RLS: this runs as the definer.
  if coalesce(public.my_role(), '') in ('viewer', 'requestor', 'crew')
     or coalesce(public.is_client_portal_user(), false)
     or public.my_org_is_read_only() is true then
    raise exception 'You do not have permission to reopen this project'
      using errcode = '42501';
  end if;

  select p.org_id, p.status, p.deleted_at, coalesce(p.contract_price_is_pretax, false),
         p.cancel_unscheduled_cents
    into v_org, v_status, v_deleted, v_pretax, v_gap0
    from public.projects p
   where p.id = p_project_id;
  if not found or v_deleted is not null then
    raise exception 'Project not found';
  end if;
  if public._org_mismatch(v_org) then
    raise exception 'Unauthorized';
  end if;

  perform 1 from public.projects where id = p_project_id for update;
  select status, cancel_unscheduled_cents into v_status, v_gap0
    from public.projects where id = p_project_id;
  if v_status <> 'canceled' then
    raise exception 'This project isn''t canceled' using errcode = 'check_violation';
  end if;

  if p_restore_milestones then
    -- Same lock order as the change-order and milestone-invoice RPCs: project, then milestones.
    perform 1 from public.estimate_milestones
     where project_id = p_project_id
       and (deleted_at is null or canceled_with_project_at is not null)
     order by id
     for update;

    with restored as (
      update public.estimate_milestones
         set deleted_at = null,
             canceled_with_project_at = null
       where project_id = p_project_id
         and canceled_with_project_at is not null
         and deleted_at is not null
         and status = 'pending'
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from restored;
    v_count := coalesce(array_length(v_ids, 1), 0);

    if v_count > 0 and v_gap0 is not null then
      select contract_price into v_contract from public.projects where id = p_project_id;
      -- Spread whatever keeps the schedule's gap to the contract where it was at cancel time.
      v_adjust := (coalesce(v_contract, 0) - public._project_milestone_schedule_cents(p_project_id)) - v_gap0;

      if v_adjust <> 0 then
        -- Current figures of the restored rows, all read BEFORE any is rewritten (freezing a
        -- percent row would move the remainder onto its siblings).
        select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'cents', t.cents)
                                  order by t.sort_order, t.id), '[]'::jsonb),
               coalesce(sum(t.cents), 0)
          into v_rows, v_total
          from (
            select m.id, m.sort_order, public._project_milestone_current_cents(m.id) as cents
              from public.estimate_milestones m
             where m.id = any(v_ids)
          ) t;
        v_n := jsonb_array_length(v_rows);

        for r in select e from jsonb_array_elements(v_rows) e loop
          v_idx := v_idx + 1;
          v_cents := (r->>'cents')::int;
          if v_idx = v_n then
            v_share := v_adjust - v_allocated;
          elsif v_total > 0 then
            v_share := round(v_adjust::numeric * v_cents / v_total);
          else
            v_share := round(v_adjust::numeric / v_n);
          end if;
          -- Never below zero; what a row can't absorb is carried to the next one.
          if v_cents + v_share < 0 then
            v_share := -v_cents;
          end if;
          v_allocated := v_allocated + v_share;

          -- A re-priced row is a flat amount on the contract's basis, as a change order makes it.
          update public.estimate_milestones
             set milestone_type   = 'flat',
                 milestone_value  = (v_cents + v_share)::int,
                 amount_cents     = (v_cents + v_share)::int,
                 amount_is_pretax = v_pretax
           where id = (r->>'id')::uuid
             and status = 'pending'
             and deleted_at is null;
        end loop;
      end if;
    end if;
  end if;

  update public.projects set status = 'sold' where id = p_project_id;

  return query select v_count, v_allocated::int, (v_adjust - v_allocated)::int;
end;
$$;

revoke all on function public.reopen_canceled_project(uuid, boolean) from public, anon;
grant execute on function public.reopen_canceled_project(uuid, boolean) to authenticated;
