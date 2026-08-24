export const JOB_SELECT =
  "id, job_number, client_id, property_id, job_type, status, sub_status, scheduled_date, start_time, end_time, crew_id, rate_cents, service_address, service_city, service_state, service_zip, notes_to_crew, created_at, updated_at";

export function shapeJob(row: Record<string, unknown>) {
  return {
    id: row.id,
    jobNumber: row.job_number,
    clientId: row.client_id,
    propertyId: row.property_id,
    jobType: row.job_type,
    status: row.status,
    subStatus: row.sub_status,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    crewId: row.crew_id,
    rateCents: row.rate_cents,
    serviceAddress: row.service_address,
    serviceCity: row.service_city,
    serviceState: row.service_state,
    serviceZip: row.service_zip,
    notesToCrew: row.notes_to_crew,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
