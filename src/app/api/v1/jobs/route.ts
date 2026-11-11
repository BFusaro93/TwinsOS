import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { JOB_SELECT, shapeJob } from "./shape";
import { createJobSchema } from "./validation";
import { createCrmJob } from "@/lib/integrations/create-crm-job";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { withIdempotency } from "@/lib/api/idempotency";

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
    // created_at ties are routine (a bulk insert shares one transaction time), so
    // offset paging needs a total order or pages repeat / skip rows.
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/jobs", error);
  return NextResponse.json({ data: (data ?? []).map(shapeJob), limit, offset });
}

/**
 * POST /api/v1/jobs — creates a job. Requires scope "jobs:write:safe".
 * The rules live in createCrmJob (shared with the Zapier "Create Job" action),
 * including converting a lead to a client first.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  // Idempotency-Key: a retried create returns the first result instead of a duplicate.
  return withIdempotency(db, auth.orgId, request, async () => {
    const parsed = createJobSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return jsonError(firstIssueMessage(parsed.error, "Invalid input"), 400);
    const body = parsed.data;

    const result = await createCrmJob(db, auth.orgId, body, { select: JOB_SELECT, context: "POST /api/v1/jobs", via: "the API" });
    if (!result.ok) {
      if (result.status === 500) return jsonServerError(result.context, result.cause);
      return NextResponse.json(
        { error: result.error, ...(result.mergedIntoClientId && { mergedIntoClientId: result.mergedIntoClientId }) },
        { status: result.status }
      );
    }
    const job = result.job;

    return NextResponse.json(shapeJob(job), { status: 201 });
  });
}
