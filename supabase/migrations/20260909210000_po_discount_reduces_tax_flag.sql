-- Whether a manual discount comes off the taxable base before sales tax is
-- computed, or off the total after tax. Vendors differ: RockAuto discounts the
-- order before taxing it, while Powell Stone & Gravel taxes the full amount and
-- credits the discount afterward. Default false matches the post-tax rule the
-- PO module uses today; tick it per-order for vendors that discount pre-tax.
alter table purchase_orders
  add column if not exists discount_reduces_tax boolean not null default false;

alter table requisitions
  add column if not exists discount_reduces_tax boolean not null default false;

notify pgrst, 'reload schema';
