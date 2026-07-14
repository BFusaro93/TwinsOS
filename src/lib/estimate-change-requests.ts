// Shared by the public proposal link and the authenticated client-portal route —
// both let a customer leave a "please change this" note on an estimate, which
// creates a record staff can see and notifies admins/managers in-app.

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

  await supabase.from("estimate_change_requests").insert({
    org_id: orgId,
    estimate_id: estimateId,
    client_id: clientId,
    message,
    requester_name: requesterName,
    requester_email: requesterEmail ?? null,
  });

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
    .select("id")
    .eq("org_id", orgId)
    .in("role", ["admin", "manager"]);

  if (staff?.length) {
    const title = `Change requested — Estimate #${estimateNumber}`;
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      staff.map((p: { id: string }) => ({
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
