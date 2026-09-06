import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { JOB_SELECT, shapeJob } from "./shape";
import { createJobSchema } from "./validation";

/** GET /api/v1/jobs — list the org's Landscapt jobs. Requires scope "jobs:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("crm_jobs")
    .select(JOB_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/jobs", error);
  return NextResponse.json({ data: (data ?? []).map(shapeJob), limit, offset });
}

/** POST /api/v1/jobs — creates a job. Requires scope "jobs:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createJobSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data: client } = await db.from("clients").select("org_id").eq("id", body.clientId).maybeSingle();
  if (!client || client.org_id !== auth.orgId) return jsonError("Client not found", 404);

  if (body.propertyId) {
    const { data: property } = await db
      .from("client_properties")
      .select("org_id")
      .eq("id", body.propertyId)
      .maybeSingle();
    if (!property || property.org_id !== auth.orgId) return jsonError("Property not found", 404);
  }
  if (body.crewId) {
    const { data: crew } = await db.from("crm_crews").select("org_id").eq("id", body.crewId).maybeSingle();
    if (!crew || crew.org_id !== auth.orgId) return jsonError("Crew not found", 404);
  }

  const { data, error } = await db
    .from("crm_jobs")
    .insert({
      org_id: auth.orgId,
      client_id: body.clientId,
      property_id: body.propertyId ?? null,
      job_type: body.jobType ?? "one_time",
      scheduled_date: body.scheduledDate ?? null,
      crew_id: body.crewId ?? null,
      rate_cents: body.rateCents ?? null,
      notes_to_crew: body.notesToCrew ?? null,
      status: "scheduled",
    })
    .select(JOB_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/jobs", error);

  // Same client-timeline row the in-app New Job dialog writes (see
  // useCreateClientJob). Admin client → org_id must be explicit (no
  // my_org_id() session default here). Best-effort.
  await db.from("client_activity").insert({
    org_id: auth.orgId,
    client_id: body.clientId,
    activity_type: "job",
    subject: `Job created: ${(body.jobType ?? "one_time").replace(/_/g, " ")}`,
    ref_id: data.id,
    ref_table: "crm_jobs",
  });

  return NextResponse.json(shapeJob(data), { status: 201 });
}
