-- Other Charges can now be a percentage of the invoice instead of a fixed
-- dollar amount (fuel surcharge 4.5%, late fee 1.5%…). A charge is still only a
-- template: adding it to an invoice works out the dollars from that invoice's
-- service lines at that moment and writes an ordinary line, so nothing on an
-- existing invoice ever changes when the catalog or the invoice later moves.
--
-- percent_bps is basis points (450 = 4.5%), the same unit discounts use.
-- amount_cents keeps meaning "the fixed amount" and is 0 for percent charges.

alter table public.crm_other_charges
  add column if not exists charge_type text not null default 'flat',
  add column if not exists percent_bps integer not null default 0;

alter table public.crm_other_charges
  drop constraint if exists crm_other_charges_charge_type_check;
alter table public.crm_other_charges
  add constraint crm_other_charges_charge_type_check check (charge_type in ('flat', 'percent'));

alter table public.crm_other_charges
  drop constraint if exists crm_other_charges_percent_bps_check;
alter table public.crm_other_charges
  add constraint crm_other_charges_percent_bps_check check (percent_bps >= 0 and percent_bps <= 100000);
