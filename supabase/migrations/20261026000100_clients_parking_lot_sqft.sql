-- Aerial Measurement tracks Parking Lot / Hardscape per property, but the client's
-- own takeoff fields (Details tab / Edit Client) had no column for it.
alter table public.clients
  add column if not exists parking_lot_sqft numeric;
