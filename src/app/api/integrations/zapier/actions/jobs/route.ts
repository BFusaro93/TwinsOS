import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, blankToUndefined, checkZapierRateLimit } from "@/lib/integrations/zapier";
import { createCrmJob } from "@/lib/integrations/create-crm-job";
import { jsonServerError } from "@/lib/api/route-helpers";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { withIdempotency } from "@/lib/api/idempotency";

// YYYY-MM-DD only: these are `date` columns, and an ISO instant is cast in UTC
// (a day early for a US org). Same rule as the v1 API.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date");

// Optional fields tolerate Zapier's "" for an unmapped field (see blankToUndefined).
const createJobSchema = z.object({
  clientId: z.string().uuid(),
  jobType: blankToUndefined(
    z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .pipe(
        z.enum(["recurring", "one_time", "waiting_list", "package", "snow", "project"], {
          message: "jobType must be recurring, one_time, waiting_list, package, snow or project",
        })
      )
  ),
  /** For jobType waiting_list this is the START of the availability window. */
  scheduledDate: blankToUndefined(isoDate),
  waitingListEnd: blankToUndefined(isoDate),
  /** With a service, the job gets its line item and (if dated) a dispatch-board visit. */
  serviceId: blankToUndefined(z.string().uuid()),
  crewId: blankToUndefined(z.string().uuid()),
  propertyId: blankToUndefined(z.string().uuid()),
  rateCents: blankToUndefined(z.coerce.number().int().nonnegative()),
  notes: blankToUndefined(z.string()),
  notesToCrew: blankToUndefined(z.string()),
  /** YYYY-MM-DD. Defaults to today in the org's timezone — drives the Sales by Date Sold reports. */
  dateSold: blankToUndefined(isoDate),
});

/**
 * POST /api/integrations/zapier/actions/jobs — Zapier action ("Create Job").
 * Same creation rules as POST /api/v1/jobs (createCrmJob): ids checked
 * against the org, waiting-list window instead of a board visit, service line
 * + visit when a service is given, timeline row and job_created trigger. A
 * lead (Zapier's Create Client always makes one) is converted to a client
 * first; a closed-lost lead is refused with a 409.
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
  // Idempotency-Key: a retried create returns the first result instead of a duplicate.
  return withIdempotency(db, auth.orgId, request, async () => {
    const parsed = createJobSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
    }

    const result = await createCrmJob(db, auth.orgId, parsed.data, {
      select: "id, job_number, job_type, status, scheduled_date, waiting_list_start, waiting_list_end, created_at",
      context: "zapier create job",
      via: "Zapier",
    });
    if (!result.ok) {
      // Don't hand raw database errors (constraint/column names) to the caller.
      if (result.status === 500) return jsonServerError(result.context, result.cause);
      return NextResponse.json(
        { error: result.error, ...(result.mergedIntoClientId && { mergedIntoClientId: result.mergedIntoClientId }) },
        { status: result.status }
      );
    }
    const data = result.job;

    return NextResponse.json({
      id: data.id,
      jobNumber: data.job_number,
      jobType: data.job_type,
      status: data.status,
      scheduledDate: data.scheduled_date,
      waitingListStart: data.waiting_list_start,
      waitingListEnd: data.waiting_list_end,
      createdAt: data.created_at,
    });
  });
}
