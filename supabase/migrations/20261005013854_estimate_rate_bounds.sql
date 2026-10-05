-- The estimate editor accepted a 250% tax rate, a 500% overhead rate and a 150%
-- win probability, and saved them; totals multiply straight through the rate.
-- The UI and useSaveEstimateFinancials now clamp to 0-100%; these CHECKs are the
-- backstop. NOT VALID: enforced for new/updated rows without failing on history.
alter table estimates drop constraint if exists estimates_tax_rate_bps_range;
alter table estimates add constraint estimates_tax_rate_bps_range
  check (tax_rate_bps between 0 and 10000) not valid;

alter table estimates drop constraint if exists estimates_overhead_rate_bps_range;
alter table estimates add constraint estimates_overhead_rate_bps_range
  check (overhead_rate_bps between 0 and 10000) not valid;

alter table estimates drop constraint if exists estimates_probability_bps_range;
alter table estimates add constraint estimates_probability_bps_range
  check (probability_bps between 0 and 10000) not valid;
