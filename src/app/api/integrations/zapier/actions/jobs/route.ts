import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";

const createJobSchema = z.object({
  clientId: z.string().uuid(),
  jobType: z.enum(["recurring", "one_time", "waiting_list", "package", "snow", "project"]).optional(),
  scheduledDate: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/integrations/zapier/actions/jobs — Zapier action ("Create Job").
 * clientId must belong to the authenticated org — checked explicitly rather
 * than trusted from the body, same guard as the clients/tickets actions.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  const parsed = createJobSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  const { data: client } = await db
    .from("clients")
    .select("org_id")
    .eq("id", body.clientId)
    .maybeSingle();
  if (!client || client.org_id !== auth.orgId) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("crm_jobs")
    .insert({
      org_id: auth.orgId,
      client_id: body.clientId,
      job_type: body.jobType ?? "one_time",
      scheduled_date: body.scheduledDate ?? null,
      notes: body.notes ?? null,
      status: "scheduled",
    })
    .select("id, job_number, job_type, status, scheduled_date, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });
  }

  // Same client-timeline row the in-app New Job dialog writes (see
  // useCreateClientJob). Admin client → org_id must be explicit. Best-effort.
  await db.from("client_activity").insert({
    org_id: auth.orgId,
    client_id: body.clientId,
    activity_type: "job",
    subject: `Job created: ${(body.jobType ?? "one_time").replace(/_/g, " ")}`,
    ref_id: data.id,
    ref_table: "crm_jobs",
  });

  return NextResponse.json({
    id: data.id,
    jobNumber: data.job_number,
    jobType: data.job_type,
    status: data.status,
    scheduledDate: data.scheduled_date,
    createdAt: data.created_at,
  });
}
