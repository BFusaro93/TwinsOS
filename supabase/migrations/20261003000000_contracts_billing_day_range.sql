-- billing_day_of_month had no range check: 0 / negative / >31 values made the
-- billing-day match logic never (or wrongly) fire. Repair out-of-range rows to
-- the nearest valid day, then add the CHECK. Idempotent.
update public.crm_contracts
   set billing_day_of_month = least(31, greatest(1, billing_day_of_month))
 where billing_day_of_month is not null
   and (billing_day_of_month < 1 or billing_day_of_month > 31);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_contracts_billing_day_of_month_range'
       and conrelid = 'public.crm_contracts'::regclass
  ) then
    -- NOT VALID so the ALTER never fails on a concurrent bad write; the
    -- data fix above already cleaned existing rows, so VALIDATE is safe.
    alter table public.crm_contracts
      add constraint crm_contracts_billing_day_of_month_range
      check (billing_day_of_month between 1 and 31) not valid;
  end if;
  alter table public.crm_contracts validate constraint crm_contracts_billing_day_of_month_range;
end $$;
