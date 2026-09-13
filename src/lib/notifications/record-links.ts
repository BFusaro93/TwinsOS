/**
 * Where a commentable record lives, keyed by the `recordType` stored on the
 * comment / notification row. Shared by the in-app notification bell and the
 * @mention email so both land on the record itself rather than its list.
 *
 * List pages that auto-open a record from a query param get the id
 * (`?id=` for the PO/CMMS lists, `?open=` for tickets); the handful that have
 * no deep-link support yet can only reach their list.
 */
const RECORD_PATHS: Record<string, (id: string) => string> = {
  ticket:       (id) => `/crm/tickets?open=${id}`,
  work_order:   (id) => `/cmms/work-orders?id=${id}`,
  po:           (id) => `/po/orders?id=${id}`,
  requisition:  (id) => `/po/requisitions?id=${id}`,
  crm_estimate: (id) => `/crm/estimates/${id}`,
  receiving:    () => "/po/receiving",
  project:      () => "/po/projects",
  damage_case:  () => "/dashboard/damage-cases",
  job_photo:    () => "/photos/projects",
};

/** Path for a record, or null when the type is unknown or the id is missing. */
export function recordPath(recordType: string | null | undefined, id: string | null | undefined): string | null {
  if (!recordType || !id) return null;
  const build = RECORD_PATHS[recordType];
  return build ? build(id) : null;
}
