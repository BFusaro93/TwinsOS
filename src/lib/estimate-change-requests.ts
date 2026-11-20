// Shared by the public proposal link and the authenticated client-portal route —
// both let a customer leave a "please change this" note on an estimate, which
// creates a record staff can see and notifies admins/managers — plus the
// estimate's salesperson — in-app.

export const MAX_CHANGE_REQUEST_MESSAGE_CHARS = 4000;

export async function submitEstimateChangeRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    orgId: string;
    estimateId: string;
    clientId: string | null;
    estimateNumber: number;
    message: string;
    requesterName: string;
    requesterEmail?: string | null;
  }
) {
  const { orgId, estimateId, clientId, estimateNumber, message, requesterName, requesterEmail } = params;

  // The change-request row is the record staff act on: if it isn't saved the
  // caller must fail (previously the error was dropped and the client was told
  // their request went through). The activity/notification writes below are
  // best-effort side effects.
  const { error: insertErr } = await supabase.from("estimate_change_requests").insert({
    org_id: orgId,
    estimate_id: estimateId,
    client_id: clientId,
    message,
    requester_name: requesterName,
    requester_email: requesterEmail ?? null,
  });
  if (insertErr) throw new Error(`Failed to save change request: ${insertErr.message}`);

  if (clientId) {
    await supabase.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "estimate",
      subject: `Change requested on Estimate #${estimateNumber}`,
      body: `${requesterName}: ${message}`,
      ref_id: estimateId,
      ref_table: "estimates",
      occurred_at: new Date().toISOString(),
    });
  }

  // Notify admins/managers in-app (same audience pattern used for new maintenance requests)
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, notification_prefs")
    .eq("org_id", orgId)
    .neq("status", "inactive")
    .in("role", ["admin", "manager"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recipients: any[] = staff ?? [];

  // The estimate's salesperson hears about it too, even when they aren't an
  // admin or manager. estimates.sales_rep_id is a crm_employees.id, so resolve
  // through crm_employees.user_id before profiles (same hop as
  // notifyStaffOfEstimateDecision). Best-effort: a failed lookup just means the
  // admin/manager audience above is all that's notified.
  const { data: estimateRow } = await supabase
    .from("estimates")
    .select("sales_rep_id")
    .eq("id", estimateId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (estimateRow?.sales_rep_id) {
    const { data: employee } = await supabase
      .from("crm_employees")
      .select("user_id")
      .eq("id", estimateRow.sales_rep_id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    const repUserId = employee?.user_id ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (repUserId && !recipients.some((p: any) => p.id === repUserId)) {
      const { data: rep } = await supabase
        .from("profiles")
        .select("id, notification_prefs")
        .eq("id", repUserId)
        .eq("org_id", orgId)
        // A deactivated login must not keep getting change-request notifications.
        .neq("status", "inactive")
        .maybeSingle();
      if (rep) recipients = [...recipients, rep];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligible = recipients.filter((p: any) => (p.notification_prefs ?? {}).inAppEstimateChangeRequest !== false);

  if (eligible.length) {
    const title = `Change requested — Estimate #${estimateNumber}`;
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eligible.map((p: { id: string }) => ({
        org_id: orgId,
        user_id: p.id,
        type: "estimate_change_request",
        title,
        message: `${requesterName}: ${message}`,
        entity_id: estimateId,
        entity_type: "estimate",
      }))
    );
  }
}
