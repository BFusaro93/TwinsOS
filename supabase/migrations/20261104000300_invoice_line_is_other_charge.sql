-- Lines added from the Other Charges catalog (fees, not services). They carry
-- no service_id, so the editor's "every line bills a service" rule exempts
-- them via this flag.
alter table public.crm_invoice_line_items
  add column if not exists is_other_charge boolean not null default false;
