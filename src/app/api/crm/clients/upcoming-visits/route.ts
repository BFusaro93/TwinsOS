import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { cancelClientVisits } from "@/lib/visits/client-visits";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

const Body = z.object({
  clientIds: z.array(z.string().uuid()).min(1).max(500),
  /** preview — count the visits that would go; cancel — cancel / prune them. */
  action: z.enum(["preview", "cancel"]),
});

/**
 * POST /api/crm/clients/upcoming-visits — backs the "Cancel their N upcoming
 * visits?" question asked when a client is cancelled or deleted.
 *
 * Auth: the org comes from the session; the caller needs the same permission
 * that gates cancelling / deleting a client (admins always pass). The clients
 * are re-read under the session org so an id from another org is dropped
 * (deleted clients included — this runs right after a delete). Every write
 * then goes through the caller's RLS client, never a service-role one, so
 * nothing outside the org can be reached even by a forged id.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  if (!profile?.org_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = profile.org_id as string;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "clientIds and action are required" }, { status: 400 });
  const { clientIds, action } = parsed.data;

  // Preview is read-only, but it still discloses visit counts, so it uses the
  // same gate as the write.
  const gates = await Promise.all(
    ["client_activate_deactivate", "client_allow_delete"].map(async (key) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.rpc as any)("has_settings_permission", { p_key: key });
      return !!data;
    })
  );
  if (!gates.some(Boolean)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: owned, error: ownedErr } = await (supabase as any)
    .from("clients")
    .select("id")
    .eq("org_id", orgId)
    .in("id", clientIds);
  if (ownedErr) return NextResponse.json({ error: ownedErr.message }, { status: 500 });
  const ownedIds = ((owned ?? []) as { id: string }[]).map((c) => c.id);
  if (ownedIds.length === 0) return NextResponse.json({ count: 0, jobs: 0 });

  try {
    const today = todayInZone(await getOrgTimeZone(supabase, orgId));
    const result = await cancelClientVisits(supabase, { clientIds: ownedIds, today, apply: action === "cancel" });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
