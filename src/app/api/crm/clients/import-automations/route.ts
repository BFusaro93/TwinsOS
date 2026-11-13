import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { dispatchClientTriggers } from "@/lib/automations/trigger-queue";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { chunk } from "@/lib/utils/chunk";

/** Same ceiling as the clients bulk route. */
const MAX_IMPORT_CLIENTS = 10_000;
/** Only records this user created this recently can be announced — an import, not a replay. */
const RECENT_MS = 2 * 60 * 60 * 1000;

const Body = z.object({
  clientIds: z.array(z.string().uuid()).min(1).max(MAX_IMPORT_CLIENTS),
});

/**
 * POST /api/crm/clients/import-automations — the CSV importers' opt-in
 * "Run automations for imported records". Fires Lead created / Client created
 * (Communication Automations and Zapier, through dispatchClientTriggers — the
 * same path the bulk actions use: inline for a small file, queued for
 * /api/automations/run otherwise) for the records the import just created.
 *
 * The trigger type comes from each record's own status, not the request (lead →
 * Lead created, active → Client created; imported lost / cancelled / inactive
 * records fire nothing). Only
 * live records in the caller's org that the caller created in the last two
 * hours count, so this can't re-announce old clients.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role === "crew") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orgId: string = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid request") }, { status: 400 });
  }

  if (!(await hasAnySettingsPermission(supabase, ["client_bulk_create", "lead_bulk_create", "imports", "client_add", "lead_add"]))) {
    return NextResponse.json({ error: "You do not have permission to do this" }, { status: 403 });
  }

  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const leadIds: string[] = [];
  const clientIds: string[] = [];
  for (const ids of chunk(Array.from(new Set(parsed.data.clientIds)), 500)) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("created_by", user.id)
      .gte("created_at", since)
      .is("deleted_at", null)
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const c of (data ?? []) as { id: string; status: string | null }[]) {
      // An imported closed / cancelled / inactive record isn't a new lead or client.
      if (c.status === "lead") leadIds.push(c.id);
      else if (c.status === "active") clientIds.push(c.id);
    }
  }

  const result = await dispatchClientTriggers(supabase, createServiceClient(), {
    orgId,
    userId: user.id,
    events: [
      { triggerType: "lead_created", clientIds: leadIds },
      { triggerType: "client_created", clientIds },
    ],
  });
  return NextResponse.json({ ...result, matched: leadIds.length + clientIds.length });
}
