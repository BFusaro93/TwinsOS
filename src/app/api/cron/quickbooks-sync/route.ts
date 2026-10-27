import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { pushInvoiceToQuickBooks, pushPaymentToQuickBooks } from "@/lib/integrations/quickbooks";
import { logger } from "@/lib/logger";

const log = logger.child("quickbooks sync cron");

/**
 * GET /api/cron/quickbooks-sync — called every 15 minutes by Vercel Cron.
 *
 * The browser/webhook triggers push to QuickBooks the moment something changes,
 * but they can be missed: a tab closed mid-debounce, an invoice created by the
 * contract/auto-invoice crons or the API, a printed-only invoice, a failed
 * attempt. This sweep catches those so the books converge. For each connected
 * org it (1) creates issued invoices that never reached QuickBooks, (2) updates
 * or voids ones that changed since their last sync, then (3) pushes payments
 * whose invoice is now there.
 *
 * Deliberately NOT a backfill: only records created after the org connected are
 * created in QuickBooks — an org's pre-existing invoices are usually already in
 * its books, and pushing them again would duplicate them.
 *
 * Anything touched in the last 10 minutes is left alone so this never races the
 * immediate triggers into creating the same invoice twice. A "changed" invoice
 * is one updated more than a minute after its last sync attempt (the sync's own
 * bookkeeping write lands within seconds of that timestamp).
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export const maxDuration = 300;

const ISSUED_STATUSES = ["sent", "printed", "viewed", "partial", "paid", "overdue"];
const SETTLE_MS = 10 * 60 * 1000;
const RETRY_FAILED_MS = 60 * 60 * 1000;
const CHANGED_SLACK_MS = 60 * 1000;
const MAX_CREATES = 50;
const MAX_UPDATES = 100;
const MAX_PAYMENTS = 50;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: integrations, error } = await db
    .from("integrations")
    .select("org_id, created_at")
    .eq("provider", "quickbooks")
    .eq("enabled", true);
  if (error) {
    log.error("failed to load QuickBooks integrations", { error });
    return NextResponse.json({ error: "Failed to load integrations" }, { status: 500 });
  }

  const now = Date.now();
  const settledBefore = new Date(now - SETTLE_MS).toISOString();
  const retryBefore = new Date(now - RETRY_FAILED_MS).toISOString();
  const summary: Record<string, { created: number; updated: number; payments: number }> = {};

  for (const integration of (integrations ?? []) as { org_id: string; created_at: string }[]) {
    const orgId = integration.org_id;
    const connectedAt = integration.created_at;
    const counts = { created: 0, updated: 0, payments: 0 };
    summary[orgId] = counts;

    try {
      // 1. Issued invoices created since connecting that never reached QuickBooks.
      const { data: toCreate } = await db
        .from("crm_invoices")
        .select("id")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .is("qbo_invoice_id", null)
        .in("status", ISSUED_STATUSES)
        .gte("created_at", connectedAt)
        .lt("updated_at", settledBefore)
        .or(`qbo_sync_attempted_at.is.null,qbo_sync_attempted_at.lt.${retryBefore}`)
        .order("created_at", { ascending: true })
        .limit(MAX_CREATES);
      for (const row of (toCreate ?? []) as { id: string }[]) {
        const result = await pushInvoiceToQuickBooks(db, orgId, row.id);
        if (result.status === "pushed") counts.created++;
        if (result.reason === "not_connected") break;
      }

      // 2. Invoices already in QuickBooks that changed (or were voided) since their last sync,
      //    plus failed ones due a retry.
      const { data: synced } = await db
        .from("crm_invoices")
        .select("id, updated_at, qbo_sync_attempted_at, qbo_sync_error")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .not("qbo_invoice_id", "is", null)
        .lt("updated_at", settledBefore)
        .order("updated_at", { ascending: false })
        .limit(MAX_UPDATES * 3);
      const changed = ((synced ?? []) as { id: string; updated_at: string; qbo_sync_attempted_at: string | null; qbo_sync_error: string | null }[])
        .filter((r) => {
          const attempted = r.qbo_sync_attempted_at ? Date.parse(r.qbo_sync_attempted_at) : 0;
          if (!attempted || Date.parse(r.updated_at) > attempted + CHANGED_SLACK_MS) return true;
          return !!r.qbo_sync_error && attempted < Date.parse(retryBefore);
        })
        .slice(0, MAX_UPDATES);
      for (const row of changed) {
        const result = await pushInvoiceToQuickBooks(db, orgId, row.id);
        if (result.status === "updated" || result.status === "voided") counts.updated++;
        if (result.reason === "not_connected") break;
      }

      // 3. Payments recorded since connecting whose invoice is in QuickBooks but which aren't.
      const { data: allocations } = await db
        .from("crm_payment_allocations")
        .select("payment_id, qbo_sync_attempted_at, crm_invoices!inner(qbo_invoice_id), crm_payments!inner(deleted_at, created_at)")
        .eq("org_id", orgId)
        .is("qbo_payment_id", null)
        .not("crm_invoices.qbo_invoice_id", "is", null)
        .is("crm_payments.deleted_at", null)
        .gte("crm_payments.created_at", connectedAt)
        .lt("crm_payments.created_at", settledBefore)
        .limit(MAX_PAYMENTS * 3);
      const paymentIds = new Set<string>();
      for (const a of (allocations ?? []) as { payment_id: string; qbo_sync_attempted_at: string | null }[]) {
        if (a.qbo_sync_attempted_at && a.qbo_sync_attempted_at > retryBefore) continue;
        paymentIds.add(a.payment_id);
        if (paymentIds.size >= MAX_PAYMENTS) break;
      }
      for (const paymentId of paymentIds) {
        const result = await pushPaymentToQuickBooks(db, orgId, paymentId);
        if (result.status === "pushed") counts.payments++;
        if (result.reason === "not_connected") break;
      }
    } catch (err) {
      log.error("QuickBooks sync sweep failed for org", { err, orgId });
    }
  }

  return NextResponse.json({ ok: true, orgs: summary });
}
