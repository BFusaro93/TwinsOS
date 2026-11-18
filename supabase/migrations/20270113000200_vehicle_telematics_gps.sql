-- Current location for the Telematics tab: Samsara's `gps` stat (position,
-- reverse-geocoded address, speed, heading). When it was measured lives in
-- stat_times.gps. NULL = the vehicle isn't reporting a position.

alter table public.vehicle_telematics_snapshots
  add column if not exists latitude        double precision,
  add column if not exists longitude       double precision,
  add column if not exists address         text,
  add column if not exists speed_mph       numeric(5,1),
  add column if not exists heading_degrees integer;
