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
 * own completion + side effects, just from one HTTP round trip instead of N.
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

  // Dedupe — the same id twice would race itself through completeVisit.
  const ids = [...new Set(parsed.data.ids)];

  // Visits of the SAME client run one after another: weekly/monthly-billed
  // clients fold every visit of a period into one open draft invoice, and
  // running those concurrently had each visit miss the others' draft and
  // create its own. Different clients never share an invoice, so they still
  // run in parallel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visitRows } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, client_id")
    .in("id", ids);
  const clientById = new Map<string, string>(
    ((visitRows ?? []) as { id: string; client_id: string | null }[]).map((r) => [r.id, r.client_id ?? `visit:${r.id}`])
  );
  const byClient = new Map<string, string[]>();
  for (const id of ids) {
    const key = clientById.get(id) ?? `visit:${id}`;
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(id);
  }

  const groupResults = await Promise.all(
    [...byClient.values()].map(async (group) => {
      const out: ({ id: string } & Awaited<ReturnType<typeof completeVisit>>)[] = [];
      for (const id of group) out.push({ id, ...(await completeVisit(supabase, user.id, id)) });
      return out;
    })
  );
  const results = groupResults.flat();

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    completed: results.length - failed.length,
    failed: failed.map((r) => ({ id: r.id, error: "error" in r ? r.error : "Unknown error" })),
  });
}
