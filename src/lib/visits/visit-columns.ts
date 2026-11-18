/**
 * Labor cost is not readable by end users.
 *
 * crm_job_visits.actual_labor_cost_cents and crm_jobs.actual_labor_cost_cents
 * hold what the crew's time cost. For a one-person crew, labor cost divided by
 * hours is that person's pay rate, so `authenticated` has no SELECT on either
 * column (20270108000300). Reports read labor cost through rpt_job_visits /
 * rpt_projects_wip, masked unless crm_can_see_labor_cost(). It is written only
 * by the service role (recomputeStopLabor / clock-out) and a definer trigger.
 *
 * Consequences for user-session code (browser hooks and routes using the
 * caller's session):
 *  - select("*"), crm_jobs(*), crm_job_visits(*) and a bare .select() after an
 *    insert/update on these tables fail with "permission denied". List
 *    columns: JOB_VISIT_READ_COLUMNS / JOB_READ_COLUMNS below.
 *  - The crew_job computed relationship gets the WHOLE visit row, and Postgres
 *    refuses a whole-row reference when any column is ungranted. So every
 *    `crm_jobs:crew_job(...)` embed reads from CREW_VISITS_VIEW, the visit
 *    without its labor cost, not from crm_job_visits.
 *
 * New columns on either table are granted to `authenticated` automatically
 * (the grant_new_readable_columns event trigger, 20270108000200); add them to
 * the lists below when the app needs them. CREW_VISITS_VIEW's column list is
 * fixed: a new visit column a crew surface needs must be added to the view.
 */

/** crm_job_visits without actual_labor_cost_cents; carries the crew_job() computed relationship. */
export const CREW_VISITS_VIEW = "crm_crew_job_visits";

/** Every crm_job_visits column except actual_labor_cost_cents. */
export const JOB_VISIT_READ_COLUMNS =
  "id, org_id, job_id, client_id, crew_id, scheduled_date, start_time, end_time, status, completion_notes, " +
  "actual_hours, completed_at, priority, notes_to_crew, created_at, updated_at, deleted_at, created_by, sub_status, " +
  "order_num, men_count, qty, rate_cents, notes_to_client, invoice_description, job_comments, assigned_employee_id, " +
  "dispatched_at, clocked_in_at, clocked_out_at, acknowledged_notes_at, skip_reason, budgeted_hours, storm_event_id, " +
  "snow_depth_inches, temperature, asset_type, materials_used, job_service_id, paused_at, break_minutes, " +
  "is_high_priority, notes_to_crew_updated_at, occurrence_date, crew_unassigned, break_paid, " +
  "chemical_confirmation_waived_at, chemical_confirmation_waived_by, crew_group_id, crew_group_secondary, " +
  "push_number, bill_push, handed_off_from_crew_id";

/**
 * What a crew route sends back about a visit: JOB_VISIT_READ_COLUMNS without
 * the visit's price (rate_cents). Crew routes read these rows with the service
 * role, which ignores the org's "hide pricing from crews" setting, and no crew
 * screen shows a visit-level price, so it is never sent to a crew device.
 */
export const CREW_VISIT_RESPONSE_COLUMNS = JOB_VISIT_READ_COLUMNS.replace(" rate_cents,", "");

/** Every crm_jobs column except actual_labor_cost_cents. Use instead of `*` in user-session reads. */
export const JOB_READ_COLUMNS =
  "id, org_id, client_id, property_id, job_type, status, sub_status, scheduled_date, start_time, end_time, " +
  "waiting_list_start, waiting_list_end, recurrence_rule, recurrence_start, recurrence_end, package_id, package_step, " +
  "package_total_steps, crew_id, man_count, rate_cents, budgeted_hours, actual_hours, service_address, service_city, " +
  "service_state, service_zip, map_code, last_service_date, notes_to_crew, completion_notes, project_id, priority, " +
  "deleted_at, created_at, updated_at, created_by, contract_id, schedule, schedule_days, package_name, package_renewal, " +
  "package_discount, conflict_days, inch_trigger, invoice_type, sales_rep_legacy_name, source, payment_type, po_number, " +
  "date_sold, when_to_invoice, invoice_separately, call_ahead, arrival_window_hours, start_date_window, end_date_window, " +
  "is_complete, service_total_cents, product_total_cents, tax_cents, total_cents, notes, invoice_description, " +
  "actual_material_cost_cents, job_number, sales_rep_id, rate_per_inch_cents, asset_type, lat, lng, estimate_id, " +
  "is_high_priority, notes_to_crew_updated_at, sale_type, renewed_from_job_id, generate_visits_after, snow_cap_kind, " +
  "invoice_terms";
