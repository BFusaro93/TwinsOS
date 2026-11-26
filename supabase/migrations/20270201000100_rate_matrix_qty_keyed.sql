-- Rate matrices keyed off the estimate line's quantity.
--
-- Some SA services price from a matrix with no property field behind it: the
-- user types the quantity on the estimate line and the bands are looked up
-- against that number. NULL custom_field_id now means exactly that ("line
-- quantity"); a non-null value still points at the property field to read.
alter table public.crm_service_rate_matrix
  alter column custom_field_id drop not null;

comment on column public.crm_service_rate_matrix.custom_field_id is
  'Property field the bands are looked up against; NULL = the estimate line''s own quantity.';
