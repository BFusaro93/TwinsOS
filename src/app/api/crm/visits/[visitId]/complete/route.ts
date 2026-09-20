import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { completeVisit } from "@/lib/visits/complete-visit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const result = await completeVisit(supabase, user.id, visitId);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // invoiceSkipReason "error" means auto-invoicing threw and was swallowed so
  // it wouldn't take the timeline row down with it. Surfacing it lets the
  // caller tell the user the visit completed but was not billed, instead of
  // the failure living only in the server log.
  return NextResponse.json({
    ok: true,
    jobId: result.jobId,
    clientId: result.clientId,
    alreadyCompleted: result.alreadyCompleted,
    invoiced: result.invoiced,
    invoiceSkipReason: result.invoiceSkipReason,
  });
}
