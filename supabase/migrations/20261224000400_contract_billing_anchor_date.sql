-- Quarterly/annual contracts: pin the billing-cycle grid once billing begins.
--
-- The cycle grid of a NOT-yet-billed quarterly/annual contract now starts on
-- the first billing day on/after its start date (start Mar 15, billing day 1
-- → cycles start Apr 1), instead of the start MONTH's billing day (Mar 1,
-- which began before the contract and was either billed early or skipped).
-- A contract that has already billed must keep its dates exactly, so the
-- billing paths stamp billing_anchor_date (the start of the first cycle they
-- bill) and the schedule math (src/lib/contract-billing.ts monthGrid) counts
-- the grid from it from then on.
--
-- 1. the column;
-- 2. contract_create_invoices-only users (Create Invoices without
--    contract_edit) may write it alongside last_billed_date /
--    first_period_prorated_at — otherwise their Create Invoices click would be
--    refused at the stamp. Every other guard of the live function is kept;
-- 3. backfill: every quarterly/annual contract that has already billed gets
--    the anchor of the grid it has been billing on — the start (else signed,
--    else created; UTC date, as the code computed it) month's billing day,
--    one month later when billed in advance.

alter table public.crm_contracts
  add column if not exists billing_anchor_date date;

comment on column public.crm_contracts.billing_anchor_date is
  'Start of the first quarterly/annual billing cycle billed; pins the cycle grid (src/lib/contract-billing.ts monthGrid). Null until billing begins.';

create or replace function public.enforce_crm_contract_write_permission()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_own_draft boolean;
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if public.has_settings_permission('contract_add') then
      return new;
    end if;
    raise exception 'You do not have permission to add contracts'
      using errcode = '42501';
  end if;

  v_own_draft := old.status = 'draft'
    and old.created_by = auth.uid()
    and public.has_settings_permission('contract_add');

  if tg_op = 'DELETE'
     or (new.deleted_at is not null and old.deleted_at is null) then
    if v_own_draft or public.has_settings_permission('contract_delete') then
      return coalesce(new, old);
    end if;
    raise exception 'You do not have permission to delete contracts'
      using errcode = '42501';
  end if;

  if public.has_settings_permission('contract_edit')
     or (v_own_draft and new.created_by is not distinct from old.created_by) then
    return new;
  end if;

  if public.has_settings_permission('contract_create_invoices')
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
           array['last_billed_date', 'first_period_prorated_at', 'billing_anchor_date']) then
    return new;
  end if;

  raise exception 'You do not have permission to edit contracts'
    using errcode = '42501';
end;
$function$;

update public.crm_contracts c
set billing_anchor_date = make_date(
      extract(year from a.m)::int,
      extract(month from a.m)::int,
      least(c.billing_day_of_month, extract(day from (a.m + interval '1 month' - interval '1 day'))::int))
from (
  select id,
         (date_trunc('month', coalesce(start_date, (signed_at at time zone 'UTC')::date, (created_at at time zone 'UTC')::date))
           + case when bill_month_in_advance then interval '1 month' else interval '0 months' end)::date as m
  from public.crm_contracts
) a
where a.id = c.id
  and c.billing_anchor_date is null
  and c.deleted_at is null
  and c.billing_frequency in ('quarterly', 'annual')
  and (
    c.last_billed_date is not null
    or exists (
      select 1 from public.crm_invoices i
      where i.contract_id = c.id
        and i.deleted_at is null
        and i.proration_period_start is null
    )
  );
