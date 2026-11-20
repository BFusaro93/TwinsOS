-- Allow zero-amount discounts in the saved catalog. Many shops keep "type the
-- amount when you use it" presets (Price Match, Discount ($), Donation /
-- Giveaway / Promotion, ...). A preset at 0 fills the discount field with 0
-- for the user to overwrite. Exactly one of percent_bps / flat_cents is still
-- required, matching discount_type; only the "> 0" floor is relaxed to ">= 0".

alter table crm_discounts drop constraint if exists crm_discounts_amount_check;
alter table crm_discounts add constraint crm_discounts_amount_check check (
  (discount_type = 'percent' and percent_bps is not null and percent_bps >= 0 and percent_bps <= 10000 and flat_cents is null) or
  (discount_type = 'flat' and flat_cents is not null and flat_cents >= 0 and percent_bps is null)
);
