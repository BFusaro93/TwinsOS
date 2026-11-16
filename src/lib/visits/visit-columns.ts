/**
 * The crm_job_visits columns the app reads for a visit: all of them except
 * actual_labor_cost_cents. A one-person crew's visit labor cost divided by its
 * hours is that person's pay rate, so crew responses and visit lists leave it
 * out; reports read labor cost through rpt_job_visits (masked unless the caller
 * may see labor cost). It is written only by the service role
 * (recomputeStopLabor / clock-out).
 *
 * The column itself is NOT revoked from `authenticated`: the crew app's
 * crew_job(crm_job_visits) computed relationship passes the whole visit row,
 * and Postgres refuses a whole-row reference when any column is ungranted, so
 * a column revoke breaks the crew schedule (tried in round 14 and dropped).
 *
 * Use this instead of `*` / a bare `.select()` on crm_job_visits, and on
 * service-role writes whose returned row goes back to the browser. Add new
 * crm_job_visits columns here when the app needs them.
 */
export const JOB_VISIT_READ_COLUMNS =
  "id, org_id, job_id, client_id, crew_id, scheduled_date, start_time, end_time, status, completion_notes, " +
  "actual_hours, completed_at, priority, notes_to_crew, created_at, updated_at, deleted_at, created_by, sub_status, " +
  "order_num, men_count, qty, rate_cents, notes_to_client, invoice_description, job_comments, assigned_employee_id, " +
  "dispatched_at, clocked_in_at, clocked_out_at, acknowledged_notes_at, skip_reason, budgeted_hours, storm_event_id, " +
  "snow_depth_inches, temperature, asset_type, materials_used, job_service_id, paused_at, break_minutes, " +
  "is_high_priority, notes_to_crew_updated_at, occurrence_date, crew_unassigned, break_paid, " +
  "chemical_confirmation_waived_at, chemical_confirmation_waived_by, crew_group_id, crew_group_secondary, " +
  "push_number, bill_push, handed_off_from_crew_id";
