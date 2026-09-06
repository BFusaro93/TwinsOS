// ============================================================
// clients.status vocabulary (CHECK: active | inactive | lead | cancelled | lost)
//
// A `clients` row is either a LEAD (never became a paying client) or a
// CLIENT (is or was one). A lead that closes without converting becomes
// status = 'lost' (with closed_at + cancellation_reason) — it is still a
// lead, not a client, so any "count my clients" predicate must use
// CLIENT_STATUSES rather than `status <> 'lead'`.
//
// `client_since` is the conversion date: NULL for lead/lost rows, set the
// day an account first becomes a client (direct client creation, or
// lead → active conversion).
// ============================================================

/** Accounts that are, or were, clients (have a client_since). */
export const CLIENT_STATUSES = ["active", "inactive", "cancelled"] as const;

/** Accounts that never converted: open leads and leads closed as lost. */
export const LEAD_STATUSES = ["lead", "lost"] as const;

/** Clients currently on the books (not cancelled). */
export const ACTIVE_CLIENT_STATUSES = ["active", "inactive"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isClientStatus(status: string | null | undefined): boolean {
  return (CLIENT_STATUSES as readonly string[]).includes(status ?? "");
}

export function isLeadStatus(status: string | null | undefined): boolean {
  return (LEAD_STATUSES as readonly string[]).includes(status ?? "");
}
