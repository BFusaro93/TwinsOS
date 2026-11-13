import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { revokeInvoiceShareTokens } from "@/lib/invoices/share-token";
import { logger } from "@/lib/logger";

const log = logger.child("crm invoice revoke pay links");

const ParamsSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/crm/invoices/[id]/revoke-pay-links — "Revoke pay link" on the
 * invoice detail page.
 *
 * Cuts off every "View & Pay Online" link already sent for this invoice (e.g.
 * an email went to the wrong person, or a link was forwarded). The links stop
 * working at once; the next time the invoice is emailed or its PDF is
 * generated, a fresh link is created. Voiding, merging or deleting an invoice
 * revokes its links automatically (DB trigger trg_crm_invoices_revoke_share_tokens).
 *
 * Gated on the same keys that let someone send or edit invoices. The write
 * goes through the service client after that check, so it works whatever the
 * invoice_share_tokens policies allow a given role — the permission check here
 * is the gate, and the invoice is first read through the caller's own session
 * so RLS decides whether they can see it at all.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const { id } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: orgId } = await supabase.rpc("my_org_id");
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasAnySettingsPermission(supabase, ["acct_send_invoices", "acct_add_modify_invoices"]))) {
    return NextResponse.json({ error: "You don't have permission to manage invoice pay links" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv } = await (supabase as any)
    .from("crm_invoices")
    .select("id, org_id, invoice_number")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: liveCount } = await (service as any)
    .from("invoice_share_tokens")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("invoice_id", id)
    .is("revoked_at", null);

  try {
    await revokeInvoiceShareTokens(service, { orgId: orgId as string, invoiceId: id });
  } catch (error) {
    log.error("failed to revoke invoice pay links", { error, invoiceId: id });
    return NextResponse.json({ error: "Couldn't revoke the pay link. Please try again." }, { status: 500 });
  }

  const revoked = liveCount ?? 0;
  if (revoked > 0) {
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("server_insert_audit", {
      p_org_id: orgId,
      p_record_type: "invoice",
      p_record_id: id,
      p_action: "updated",
      p_description: "Revoked the invoice's online pay link. A new link is created the next time the invoice is emailed or downloaded.",
      p_created_by: user.id,
      p_user_name: (profile as { name?: string | null } | null)?.name ?? user.email ?? "System",
    });
  }

  return NextResponse.json({ ok: true, revoked });
}
