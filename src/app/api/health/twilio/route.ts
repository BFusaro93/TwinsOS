import { NextResponse } from "next/server";
import { fetchTwilioStatus } from "@/lib/health/twilio-status";

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated, no secrets — for an uptime monitor. 503 only when a
 * Twilio component Landscapt depends on has a partial/major outage; degraded
 * performance, planned maintenance, and unrelated incidents (Voice, APAC) stay 200.
 */
export async function GET() {
  const result = await fetchTwilioStatus();
  return NextResponse.json(result, { status: result.status === "down" ? 503 : 200 });
}
