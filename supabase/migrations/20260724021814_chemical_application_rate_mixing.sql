-- Mixing/dilution info for chemical application rates, matching Service
-- Autopilot's "Product Mix" tab: a rate can be applied Not Mixed, Mixed with
-- Water (a dilution ratio), or Mixed with Products (a ratio against another
-- product in the catalog). Each side of a ratio gets its own selectable
-- volume unit rather than mirroring the row's own Units of Measure, since
-- that's simpler and more flexible for real dilution recipes that mix units
-- (e.g. ounces of chemical per gallon of water).

alter table crm_chemical_application_rates
  add column if not exists mix_type text not null default 'none'
    check (mix_type in ('none', 'water', 'product')),
  add column if not exists dilution_chemical_qty     numeric,
  add column if not exists dilution_chemical_unit_id uuid references crm_chemical_lookup_items(id) on delete set null,
  add column if not exists dilution_water_qty        numeric,
  add column if not exists dilution_water_unit_id    uuid references crm_chemical_lookup_items(id) on delete set null,
  add column if not exists mix_product_id            uuid references product_items(id) on delete set null,
  add column if not exists mix_product_amount_qty    numeric,
  add column if not exists mix_product_amount_unit_id uuid references crm_chemical_lookup_items(id) on delete set null,
  add column if not exists mix_product_total_qty     numeric,
  add column if not exists mix_product_total_unit_id uuid references crm_chemical_lookup_items(id) on delete set null;
