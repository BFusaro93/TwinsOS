-- Per-service minimum charge (SA's "Minimum Amount" + "Minimum Amount Message").
--
-- A per-unit estimate line (qty x rate x visits) is raised to the minimum for
-- each visit when qty x rate falls below it, e.g. a "4-hour minimum" of $660 on
-- a $165/hr machine. The minimum is COPIED onto the estimate line when the
-- service is added (like the rate is), so editing the service later never
-- reprices an estimate already in progress. 0 = no minimum.

alter table crm_services
  add column if not exists minimum_charge_cents integer not null default 0,
  add column if not exists minimum_charge_message text;

alter table crm_services
  drop constraint if exists crm_services_minimum_charge_nonneg;
alter table crm_services
  add constraint crm_services_minimum_charge_nonneg check (minimum_charge_cents >= 0);

alter table estimate_line_items
  add column if not exists min_charge_cents integer not null default 0,
  add column if not exists min_charge_message text;

alter table estimate_line_items
  drop constraint if exists estimate_line_items_min_charge_nonneg;
alter table estimate_line_items
  add constraint estimate_line_items_min_charge_nonneg check (min_charge_cents >= 0);
