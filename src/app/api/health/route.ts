import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const log = logger.child("health");

export async function GET() {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("organizations")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    // Unauthenticated endpoint: log the real error, never echo Postgres
    // messages (table/column names, connection details) to the caller.
    log.error("health check database query failed", { error: error.message });
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }

  return NextResponse.json({ status: "ok", database: "reachable" });
}
