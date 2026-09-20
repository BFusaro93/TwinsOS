-- Change orders. Until now the only way to record extra scope was to retype
-- projects.contract_price, which overwrote the original with no record of what
-- changed, why, who approved it, or when -- and left estimated_cost_cents
-- behind, so a bigger scope looked like a pure margin windfall on the WIP
-- report.
--
-- contract_price becomes DERIVED: original_contract_price + every approved
-- change order. That is also what closes the deposit hole. If the contract can
-- be edited freely underneath a part-billed milestone schedule, a locked
-- deposit (billed at a % of the OLD contract) plus percentages of the NEW one
-- silently under-bills the client by the deposit's share of the increase. A
-- change order instead applies its amount to the PENDING milestones only, in
-- exact cents, so the schedule always re-totals to the revised contract.

alter table public.projects
  add column if not exists original_contract_price integer not null default 0;

-- Everything that exists today was entered as the whole contract.
update public.projects
set original_contract_price = contract_price
where original_contract_price = 0 and contract_price <> 0;

create table if not exists public.project_change_orders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default my_org_id() references public.organizations(id),
  project_id    uuid not null references public.projects(id) on delete cascade,
  co_number     integer not null,
  title         text not null default '',
  description   text not null default '',
  -- Signed: a deductive change order (scope removed) is negative.
  amount_cents  integer not null default 0,
  -- What the extra scope COSTS. Feeds the project's EAC so margin stays honest.
  cost_impact_cents integer not null default 0,
  status        text not null default 'draft'
                  check (status in ('draft','pending_approval','approved','rejected')),
  -- How an approved CO lands on the billing schedule.
  billing_treatment text not null default 'distribute'
                  check (billing_treatment in ('distribute','own_milestone','final_milestone','none')),
  requested_date date not null default current_date,
  approved_at   timestamptz,
  approved_by   uuid references public.profiles(id),
  -- The client's authorisation for the change (their PO, email, signature ref).
  client_reference text,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id)
);

create index if not exists idx_project_change_orders_project
  on public.project_change_orders (org_id, project_id) where deleted_at is null;

-- One CO number per project. Partial so a soft-deleted CO frees its number.
create unique index if not exists idx_project_change_orders_number
  on public.project_change_orders (project_id, co_number) where deleted_at is null;

alter table public.project_change_orders enable row level security;

create policy "project_change_orders_select" on public.project_change_orders for select
  using (org_id = public.my_org_id());
create policy "project_change_orders_insert" on public.project_change_orders for insert
  with check (org_id = public.my_org_id());
create policy "project_change_orders_update" on public.project_change_orders for update
  using (org_id = public.my_org_id());

drop trigger if exists trg_project_change_orders_updated_at on public.project_change_orders;
create trigger trg_project_change_orders_updated_at
  before update on public.project_change_orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_project_change_orders_audit on public.project_change_orders;
create trigger trg_project_change_orders_audit
  after insert or delete or update on public.project_change_orders
  for each row execute function public.fn_audit_log();

-- ── contract_price is now derived ────────────────────────────────────────────
-- Recomputed from the original plus approved COs whenever one changes. Kept as
-- a stored column (not a view) so every existing reader -- rpt_projects_wip,
-- use-projects.ts, the milestone basis -- keeps working untouched.
create or replace function public.fn_recalc_project_contract_price(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects p
  set contract_price = p.original_contract_price + coalesce((
        select sum(co.amount_cents)
        from public.project_change_orders co
        where co.project_id = p.id
          and co.status = 'approved'
          and co.deleted_at is null
      ), 0)
  where p.id = p_project_id;
end;
$$;

revoke execute on function public.fn_recalc_project_contract_price(uuid) from public, anon;

create or replace function public.fn_project_change_orders_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_recalc_project_contract_price(coalesce(new.project_id, old.project_id));
  return null;
end;
$$;

revoke execute on function public.fn_project_change_orders_sync() from public, anon;

drop trigger if exists trg_project_change_orders_sync on public.project_change_orders;
create trigger trg_project_change_orders_sync
  after insert or update or delete on public.project_change_orders
  for each row execute function public.fn_project_change_orders_sync();

-- CO numbers are per project and assigned server-side. Doing it client-side
-- with max()+1 is the same race that produced duplicate WO/PO/requisition
-- numbers: two people adding a CO at once both read the same max. The lock on
-- the parent project row serialises them.
create or replace function public.fn_assign_co_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock uuid;
begin
  if new.co_number is not null and new.co_number > 0 then
    return new;
  end if;
  select id into v_lock from public.projects where id = new.project_id for update;
  select coalesce(max(co_number), 0) + 1 into new.co_number
  from public.project_change_orders
  where project_id = new.project_id and deleted_at is null;
  return new;
end;
$$;

revoke execute on function public.fn_assign_co_number() from public, anon;

drop trigger if exists trg_assign_co_number on public.project_change_orders;
create trigger trg_assign_co_number
  before insert on public.project_change_orders
  for each row execute function public.fn_assign_co_number();

alter table public.project_change_orders alter column co_number drop not null;
