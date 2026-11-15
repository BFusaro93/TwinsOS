/**
 * Every crm_job_visits column an end-user session may read: all of them except
 * actual_labor_cost_cents. That column's direct SELECT is revoked from
 * `authenticated` (migration 20270106000390) — a one-person crew's visit labor
 * cost divided by its hours is that person's pay rate. Labor cost is read
 * through rpt_job_visits (masked unless the caller may see labor cost) and
 * written only by the service role (recomputeStopLabor / clock-out).
 *
 * Use this instead of `*` / a bare `.select()` on crm_job_visits from a user
 * session (a `*` there fails once the column is revoked), and on service-role
 * writes whose returned row goes back to the browser.
 *
 * !! A new crm_job_visits column must be added here AND granted to
 *    `authenticated` (re-run the DO block in 20270106000390).
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
