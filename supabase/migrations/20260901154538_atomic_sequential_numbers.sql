-- work_order_number/po_number/requisition_number are all generated
-- client-side as `${prefix}-${year}-${Date.now().toString().slice(-6)}` —
-- two requests in the same millisecond (concurrent submits, a double-click,
-- two automation runs) produce the same number, and since none of these
-- three columns has a uniqueness constraint, both inserts silently succeed
-- with duplicate numbers. Same root cause as the damage-case number race
-- fixed in 20260829100000_fix_damage_case_bugs.sql (a plain COUNT(*)-style
-- scheme instead of a real atomic counter) — apply the identical fix here:
-- a counter table whose UPSERT increment is serialized by Postgres per row,
-- so two concurrent callers can never be handed the same number.

create table if not exists public.entity_number_counters (
  org_id      uuid not null references public.organizations(id),
  entity_type text not null,
  period      text not null,
  count       int  not null default 0,
  primary key (org_id, entity_type, period)
);
alter table public.entity_number_counters enable row level security;
-- No end-user policy: only the next_*_number() functions (SECURITY
-- DEFINER) touch this table, same as damage_case_counters.

-- Seed each org/year's counter from existing data so numbering continues
-- from the current count instead of restarting at 1 and colliding with
-- real existing numbers. Existing numbers are ${prefix}-${year}-NNNNNN;
-- count(*) per org/year is a safe starting point since the migration above
-- already confirmed no live duplicates exist to seed from.
insert into public.entity_number_counters (org_id, entity_type, period, count)
select org_id, 'work_order', to_char(created_at, 'YYYY'), count(*)
from public.work_orders where deleted_at is null group by org_id, to_char(created_at, 'YYYY')
on conflict (org_id, entity_type, period) do nothing;

insert into public.entity_number_counters (org_id, entity_type, period, count)
select org_id, 'purchase_order', to_char(created_at, 'YYYY'), count(*)
from public.purchase_orders where deleted_at is null group by org_id, to_char(created_at, 'YYYY')
on conflict (org_id, entity_type, period) do nothing;

insert into public.entity_number_counters (org_id, entity_type, period, count)
select org_id, 'requisition', to_char(created_at, 'YYYY'), count(*)
from public.requisitions where deleted_at is null group by org_id, to_char(created_at, 'YYYY')
on conflict (org_id, entity_type, period) do nothing;

-- p_org_id_override lets a service-role caller (the admin client used by
-- createRequisitionRecord() for the public v1 API / crew-app requisition
-- routes, which have no end-user session for auth.uid() to resolve) supply
-- the org directly — only honored when the caller is actually service_role,
-- so an ordinary authenticated user can never pass another org's id to
-- bump its counter.
create or replace function public.next_entity_number(p_entity_type text, p_prefix text, p_org_id_override uuid default null)
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
  if p_org_id_override is not null and auth.role() = 'service_role' then
    v_org_id := p_org_id_override;
  else
    select org_id into v_org_id from profiles where id = auth.uid();
  end if;
  if v_org_id is null then
    raise exception 'No org for current user';
  end if;

  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (v_org_id, p_entity_type, v_year, 1)
  on conflict (org_id, entity_type, period)
    do update set count = public.entity_number_counters.count + 1
  returning count into v_count;

  return p_prefix || '-' || v_year || '-' || lpad(v_count::text, 6, '0');
end;
$$;

create or replace function public.next_work_order_number(p_org_id_override uuid default null)
returns text language sql security definer set search_path = public
as $$ select public.next_entity_number('work_order', 'WO', p_org_id_override) $$;

create or replace function public.next_po_number(p_org_id_override uuid default null)
returns text language sql security definer set search_path = public
as $$ select public.next_entity_number('purchase_order', 'PO', p_org_id_override) $$;

create or replace function public.next_requisition_number(p_org_id_override uuid default null)
returns text language sql security definer set search_path = public
as $$ select public.next_entity_number('requisition', 'REQ', p_org_id_override) $$;

-- Partial (not a plain UNIQUE constraint) — soft-deleted rows can and do
-- share a number with a live row (a PO was deleted and its number reused),
-- confirmed live on prod. Scoping to deleted_at is null is what actually
-- matches the "no duplicate active numbers" invariant this migration
-- intends to enforce.
create unique index if not exists work_orders_org_number_unique
  on public.work_orders (org_id, work_order_number) where deleted_at is null;
create unique index if not exists purchase_orders_org_number_unique
  on public.purchase_orders (org_id, po_number) where deleted_at is null;
create unique index if not exists requisitions_org_number_unique
  on public.requisitions (org_id, requisition_number) where deleted_at is null;
