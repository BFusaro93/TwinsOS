-- Add unique constraint required for the upsert in /api/crm/crew/visits/[visitId]/member-times
-- The route uses onConflict: "visit_id,crew_member_id" which requires this constraint to exist.
alter table crm_crew_member_times
  add constraint crm_crew_member_times_visit_member_unique
  unique (visit_id, crew_member_id);
