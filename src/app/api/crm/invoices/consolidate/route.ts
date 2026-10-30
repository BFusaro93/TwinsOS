import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

const ConsolidateSchema = z
  .object({ invoiceIds: z.array(z.string().uuid()).min(2) })
  .refine((v) => new Set(v.invoiceIds).size === v.invoiceIds.length, {
    message: "Each invoice can only be selected once",
  });

// Bills several sub-accounts' invoices together on their parent account:
// one new invoice on the parent, originals voided and linked to it. All writes
// happen in crm_consolidate_invoices (one transaction, totals summed from the
// source invoices in SQL, validated again under row locks).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasAnySettingsPermission(supabase, ["acct_add_modify_invoices"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = ConsolidateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { invoiceIds } = parsed.data;

  const { data: profile } = await supabase.from("profiles").select("org_id, name").eq("id", user.id).single();
  const orgId: string | null = (await getEffectiveOrgId(supabase)) ?? profile?.org_id ?? null;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorName: string = profile?.name ?? user.email ?? "System";

  const { data: invoices } = await supabase
    .from("crm_invoices")
    .select("id, client_id, invoice_number")
    .in("id", invoiceIds)
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (!invoices || invoices.length !== invoiceIds.length) {
    return NextResponse.json({ error: "One or more invoices not found" }, { status: 404 });
  }

  // The parent account is the one every selected invoice's client hangs off:
  // each client is either the parent itself or a direct sub-account of it.
  const clientIds = [...new Set(invoices.map((i) => i.client_id))];
  const { data: clients } = await supabase
    .from("clients")
    .select("id, parent_client_id")
    .in("id", clientIds)
    .eq("org_id", orgId);
  if (!clients || clients.length !== clientIds.length) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  const parentIds = new Set(clients.map((c) => c.parent_client_id).filter((p): p is string => !!p));
  if (parentIds.size !== 1) {
    return NextResponse.json(
      { error: "Selected invoices must belong to sub-accounts of the same parent account" },
      { status: 422 }
    );
  }
  const parentClientId = [...parentIds][0];
  const strays = clients.filter((c) => c.id !== parentClientId && c.parent_client_id !== parentClientId);
  if (strays.length > 0) {
    return NextResponse.json(
      { error: "Selected invoices must belong to sub-accounts of the same parent account" },
      { status: 422 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error: rpcErr } = await (supabase as any).rpc("crm_consolidate_invoices", {
    p_parent_client_id: parentClientId,
    p_invoice_ids: invoiceIds,
  });
  if (rpcErr) {
    // Validation failures raised by the RPC are user-facing; nothing was written.
    return NextResponse.json({ error: rpcErr.message ?? "Consolidation failed" }, { status: 422 });
  }
  const row = (Array.isArray(result) ? result[0] : result) as { invoice_id: string; total_cents: number } | undefined;
  if (!row) return NextResponse.json({ error: "Consolidation failed" }, { status: 500 });

  const numbers = invoices.map((i) => `#${i.invoice_number ?? "draft"}`).join(", ");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc("server_insert_audit", {
    p_org_id: orgId,
    p_record_type: "invoice",
    p_record_id: row.invoice_id,
    p_action: "created",
    p_description: `Consolidated invoices ${numbers} from sub-accounts into this invoice. Total: $${(row.total_cents / 100).toFixed(2)}.`,
    p_created_by: user.id,
    p_user_name: actorName,
  });

  return NextResponse.json({ ok: true, invoiceId: row.invoice_id });
}
