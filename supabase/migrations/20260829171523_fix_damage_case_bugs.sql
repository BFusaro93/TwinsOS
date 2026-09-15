-- Two bugs in the damage cases module:
--
-- 1. Neither damage_cases.purchase_order_id nor
--    damage_case_expenses.purchase_order_id ever validated that the
--    referenced PO belongs to the same org as the row linking to it — the
--    FK only checks the PO exists at all, and RLS only checks the damage
--    case/expense's own org_id. A guessed/leaked PO id from another org
--    could get persisted as a cross-tenant reference with no error.
--
-- 2. next_damage_case_number() derives the next number from a plain
--    COUNT(*), so two concurrent case creations in the same org/year can
--    compute the same number and collide on the UNIQUE(org_id, case_number)
--    constraint (currently papered over by a 3-attempt client-side retry).
--    An advisory lock held only inside this function wouldn't actually fix
--    it — the client calls this RPC and then INSERTs in a SEPARATE request/
--    transaction, so any lock here is released before that insert even
--    starts. A real atomic counter table closes the race regardless of
--    transaction boundaries between the two calls: each concurrent caller's
--    UPSERT increment is itself serialized by Postgres on the counter row,
--    so two callers can never be handed the same number.

create or replace function public.guard_damage_case_po_org_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purchase_order_id is not null then
    if not exists (
      select 1 from public.purchase_orders
      where id = new.purchase_order_id and org_id = new.org_id
    ) then
      raise exception 'purchase_order_id must belong to the same org as this record';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_damage_case_po_org_match on public.damage_cases;
create trigger trg_guard_damage_case_po_org_match
  before insert or update on public.damage_cases
  for each row execute function public.guard_damage_case_po_org_match();

drop trigger if exists trg_guard_damage_case_expense_po_org_match on public.damage_case_expenses;
create trigger trg_guard_damage_case_expense_po_org_match
  before insert or update on public.damage_case_expenses
  for each row execute function public.guard_damage_case_po_org_match();

create table if not exists public.damage_case_counters (
  org_id     uuid not null references public.organizations(id),
  case_year  text not null,
  count      int  not null default 0,
  primary key (org_id, case_year)
);
alter table public.damage_case_counters enable row level security;
-- No end-user policy: only next_damage_case_number() (SECURITY DEFINER)
-- touches this table.

-- Seed each org/year's counter from existing data once, so numbering
-- continues from the current count instead of restarting at 1 and
-- colliding with real existing case numbers.
insert into public.damage_case_counters (org_id, case_year, count)
select org_id, to_char(created_at, 'YYYY'), count(*)
from public.damage_cases
where deleted_at is null
group by org_id, to_char(created_at, 'YYYY')
on conflict (org_id, case_year) do nothing;

create or replace function next_damage_case_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   text := to_char(now(), 'YYYY');
  v_org_id uuid;
  v_count  int;
begin
  select org_id into v_org_id from profiles where id = auth.uid();

  insert into public.damage_case_counters (org_id, case_year, count)
  values (v_org_id, v_year, 1)
  on conflict (org_id, case_year)
    do update set count = public.damage_case_counters.count + 1
  returning count into v_count;

  return 'DC-' || v_year || '-' || lpad(v_count::text, 3, '0');
end;
$$;
