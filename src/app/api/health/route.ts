import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("organizations")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { status: "error", database: "unreachable", message: error.message },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: "ok", database: "reachable" });
}
