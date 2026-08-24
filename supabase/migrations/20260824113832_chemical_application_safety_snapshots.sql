-- crm_chemical_applications already snapshots epa_number_snapshot (frozen at
-- time of application, since the catalog's own epa_registration_number can
-- be corrected later and a compliance record must reflect what was actually
-- true when the product was applied) — but the UI never populated it, and
-- the equally compliance-sensitive re-entry interval and restricted-product
-- flag were never snapshotted at all, only ever readable off the live
-- product_items row. Add the two missing snapshot columns so the application
-- flow (ChemicalApplicationPanel) can freeze all three at creation time.

alter table public.crm_chemical_applications
  add column if not exists re_entry_interval_snapshot text,
  add column if not exists restricted_product_snapshot boolean;
