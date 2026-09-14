-- Milestone billing already existed, but only on estimates. Once an estimate
-- was converted to a project the schedule was stranded behind it: the project's
-- Milestone tab was a stub, and there was no way to bill "30% at rough-in"
-- from the project you were actually running.
--
-- Rather than copy milestones into a second table (two rows to keep in sync,
-- and an 'invoiced' flag that could disagree with itself), generalize the one
-- that exists. A milestone now belongs to an estimate, a project, or both:
--   * converted from an estimate -> both ids set, one row, one status
--   * added directly on a project -> project_id only (projects entered by hand
--     never had an estimate, and still need milestone billing)
--   * still just a proposal      -> estimate_id only, exactly as today

alter table public.estimate_milestones
  add column if not exists project_id  uuid references public.projects(id) on delete set null,
  add column if not exists target_date date;

alter table public.estimate_milestones
  alter column estimate_id drop not null;

create index if not exists idx_estimate_milestones_project
  on public.estimate_milestones (org_id, project_id) where deleted_at is null;

-- Backfill the link for everything already sold, through the same
-- estimate -> crm_jobs -> project hop the convert flow builds.
update public.estimate_milestones m
set project_id = j.project_id
from public.crm_jobs j
where j.estimate_id = m.estimate_id
  and j.project_id is not null
  and j.deleted_at is null
  and m.project_id is null
  and m.deleted_at is null;

-- Added after the backfill so pre-existing rows can't trip it.
do $do$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'estimate_milestones_has_parent'
  ) then
    alter table public.estimate_milestones
      add constraint estimate_milestones_has_parent
      check (estimate_id is not null or project_id is not null);
  end if;
end
$do$;

-- create_invoice_from_milestone gains project attribution. Unchanged from
-- 20260829060000 except: it resolves project_id (from the milestone, else the
-- job the estimate was converted into), stamps it on the invoice, and tolerates
-- a milestone with no estimate behind it.
--
-- The row lock and the already-invoiced check are the whole point of this
-- function -- see the original migration -- so they stay exactly as they were.
create or replace function public.create_invoice_from_milestone(
  p_milestone_id uuid,
  p_client_id    uuid,
  p_sales_rep_id uuid default null,
  p_po_number    text default null
)
returns table(invoice_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id      uuid;
  v_estimate_id uuid;
  v_project_id  uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_invoice_id  uuid;
begin
  select org_id, estimate_id, project_id, name, amount_cents, status
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  -- A milestone invoiced from the estimate side still belongs to the project
  -- that estimate became, so the project's Billing tab and the WIP report see
  -- it without the user having to bill from the project specifically.
  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, po_number, subtotal_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), p_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    current_date, p_po_number, v_amount, v_amount, v_amount, 'draft'
  )
  returning id into v_invoice_id;

  -- org_id explicitly, matching the invoice insert above. It was relying on
  -- the column's my_org_id() default, which makes a SECURITY DEFINER function
  -- depend on the caller's session for a value it already has in hand.
  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_amount, v_amount, 0
  );

  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$$;

-- Matches 20260913160000: SECURITY DEFINER functions are not for anon.
revoke execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) to authenticated;
