-- Crew pause time: paid or unpaid.
--
-- Org default lives in organizations.customizations->>'crewBreaksUnpaid'
-- (absent = TRUE = unpaid; per-key audited by fn_audit_organization, so no
-- schema change is needed for it). This column is the per-visit office
-- override: NULL = follow the org setting, TRUE = this visit's break_minutes
-- are paid, FALSE = unpaid. It only affects labor COST; actual hours stay net
-- of break either way (productivity, not pay).
alter table crm_job_visits
  add column if not exists break_paid boolean;

comment on column crm_job_visits.break_paid is
  'Office override for whether break_minutes are paid labor. NULL = follow organizations.customizations.crewBreaksUnpaid (default unpaid).';
