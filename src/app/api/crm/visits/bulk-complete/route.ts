import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { completeVisit } from "@/lib/visits/complete-visit";

const BulkCompleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * One request replacing the dispatch board's old Promise.all of N individual
 * POSTs to /api/crm/visits/[visitId]/complete — each visit still runs its
 * own completion + side effects (invoicing, automations aren't shared across
 * visits), just from one HTTP round trip instead of N.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = BulkCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const results = await Promise.all(
    parsed.data.ids.map(async (id) => ({ id, ...(await completeVisit(supabase, user.id, id)) }))
  );

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    completed: results.length - failed.length,
    failed: failed.map((r) => ({ id: r.id, error: "error" in r ? r.error : "Unknown error" })),
  });
}
