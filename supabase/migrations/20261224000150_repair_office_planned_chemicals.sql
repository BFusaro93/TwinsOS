-- DATA REPAIR (runs on PROD when this migration is applied).
--
-- Before 20261224000100, a chemical the office added to a visit nobody had
-- worked yet was saved as APPLIED (preloaded = false), so the plan showed in the
-- compliance report once the visit was worked, went out on Notices of Treatment
-- and came out of stock when the visit was completed — whether or not the crew
-- put it down. Those rows become what they are: the plan, unconfirmed, for the
-- crew to confirm.
--
-- Only unconfirmed rows on live visits that are still scheduled/dispatched and
-- never clocked in. One row per (visit, product): the partial unique index on
-- preloaded rows allows only one, so a product already planned on the visit (or
-- a second office row for the same product) is left as it is.
with candidates as (
  select ca.id,
         row_number() over (partition by ca.visit_id, ca.product_id order by ca.created_at, ca.id) as rn
  from public.crm_chemical_applications ca
  join public.crm_job_visits v on v.id = ca.visit_id
  where ca.deleted_at is null
    and not ca.preloaded
    and ca.confirmed_at is null
    and v.deleted_at is null
    and v.clocked_in_at is null
    and v.status in ('scheduled', 'dispatched')
    and not exists (
      select 1 from public.crm_chemical_applications o
      where o.visit_id = ca.visit_id
        and o.product_id is not distinct from ca.product_id
        and o.preloaded
        and o.deleted_at is null
    )
)
update public.crm_chemical_applications ca
set preloaded = true
from candidates c
where c.id = ca.id
  and c.rn = 1;
