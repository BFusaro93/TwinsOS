/**
 * Who hears about a rep-owned reminder (contract expiry, sales meeting,
 * warranty expiry).
 *
 * These crons used to look the rep up in crm_employees with no regard for
 * deleted_at / is_active, so a reminder owned by a rep who had since left was
 * either sent to a dead mailbox or silently dropped — and the cron's claim
 * stamp was already taken, so nobody was ever told. Routing now falls through
 *
 *   1. the owning rep, if still a live (not deleted, active) employee with a
 *      reachable channel (a linked, non-inactive login and/or an email);
 *   2. the client's account manager (clients.sales_rep_id) under the same rule;
 *   3. every active org admin.
 *
 * Callers apply the per-type notification_prefs keys themselves (each reminder
 * has its own `inApp…` / `email…` key) using `prefs` on the recipient, and
 * release their claim if the final list ends up empty ("never notify nobody").
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export type ReminderRecipient = {
  /** Linked login, when there is one — the target of the in-app notification. */
  userId: string | null;
  /** Email address, when there is one. */
  email: string | null;
  firstName: string;
  /** profiles.notification_prefs of the linked login ({} when none). */
  prefs: Record<string, unknown>;
};

export type ReminderRoute = "rep" | "account_manager" | "admins" | "none";

type EmployeeRow = {
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
};

export async function recipientFromEmployee(db: AnyDb, orgId: string, employeeId: string | null | undefined): Promise<ReminderRecipient | null> {
  if (!employeeId) return null;
  const { data } = await db
    .from("crm_employees")
    .select("user_id, email, first_name, last_name, is_active, deleted_at")
    .eq("id", employeeId)
    .eq("org_id", orgId)
    .maybeSingle();
  const emp = data as EmployeeRow | null;
  // Departed: removed, or deactivated.
  if (!emp || emp.deleted_at || emp.is_active === false) return null;

  let userId: string | null = null;
  let profileEmail: string | null = null;
  let prefs: Record<string, unknown> = {};
  if (emp.user_id) {
    const { data: profile } = await db
      .from("profiles")
      .select("email, status, notification_prefs")
      .eq("id", emp.user_id)
      .maybeSingle();
    // A login that was deactivated (or no longer exists) can't receive anything.
    if (profile && profile.status !== "inactive") {
      userId = emp.user_id;
      profileEmail = (profile.email as string | null) ?? null;
      prefs = (profile.notification_prefs ?? {}) as Record<string, unknown>;
    }
  }
  const email = emp.email || profileEmail || null;
  if (!userId && !email) return null; // nothing reachable — treat like a departed rep
  return { userId, email, firstName: emp.first_name ?? "", prefs };
}

export async function resolveReminderRecipients(
  db: AnyDb,
  args: { orgId: string; repEmployeeId?: string | null; clientId?: string | null }
): Promise<{ recipients: ReminderRecipient[]; route: ReminderRoute }> {
  const { orgId, repEmployeeId, clientId } = args;

  const rep = await recipientFromEmployee(db, orgId, repEmployeeId);
  if (rep) return { recipients: [rep], route: "rep" };

  if (clientId) {
    const { data: client } = await db
      .from("clients")
      .select("sales_rep_id")
      .eq("id", clientId)
      .eq("org_id", orgId)
      .maybeSingle();
    const managerId = (client as { sales_rep_id?: string | null } | null)?.sales_rep_id ?? null;
    if (managerId && managerId !== repEmployeeId) {
      const manager = await recipientFromEmployee(db, orgId, managerId);
      if (manager) return { recipients: [manager], route: "account_manager" };
    }
  }

  const { data: admins } = await db
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .neq("status", "inactive");
  const recipients: ReminderRecipient[] = ((admins ?? []) as {
    id: string;
    email: string | null;
    name: string | null;
    notification_prefs: Record<string, unknown> | null;
  }[]).map((a) => ({
    userId: a.id,
    email: a.email ?? null,
    firstName: (a.name ?? "").split(" ")[0] ?? "",
    prefs: a.notification_prefs ?? {},
  }));
  return { recipients, route: recipients.length ? "admins" : "none" };
}
