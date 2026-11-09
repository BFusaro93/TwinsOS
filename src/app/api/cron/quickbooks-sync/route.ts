import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { pushInvoiceToQuickBooks, pushPaymentToQuickBooks, syncPaymentToQuickBooks, retryPendingQuickBooksVoids, QBO_DUPLICATE_NAME_MESSAGE } from "@/lib/integrations/quickbooks";
import { logger } from "@/lib/logger";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";

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
 * its books, and pushing them again would duplicate them. "Connected" is the
 * connection's own start (config.connected_at — reset when the org switches to a
 * different QuickBooks company), falling back to the row's created_at. A payment
 * counts by when it was APPLIED (allocation created_at), so a prepayment taken
 * before connecting but applied to an invoice afterwards is still sent.
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
/** Stop cleanly before maxDuration; the next 15-minute run starts from a different org. */
const TIME_BUDGET_MS = 240_000;

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
    .select("org_id, created_at, connected_at:config->>connected_at")
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
  const orgInactive = createOrgCanceledResolver(supabase);
  const overBudget = () => Date.now() - now > TIME_BUDGET_MS;
  let stoppedEarly = false;

  // Rotate the starting org every run: with a fixed order, one org's backlog could use up the
  // whole run every time and the orgs after it were never synced.
  const list = ((integrations ?? []) as { org_id: string; created_at: string; connected_at: string | null }[]).sort((a, b) => a.org_id.localeCompare(b.org_id));
  const offset = list.length ? Math.floor(now / (15 * 60 * 1000)) % list.length : 0;
  const ordered = [...list.slice(offset), ...list.slice(0, offset)];

  for (const integration of ordered) {
    if (overBudget()) { stoppedEarly = true; break; }
    const orgId = integration.org_id;
    // A canceled or expired-trial org is read-only; its books are not pushed meanwhile.
    if (await orgInactive(orgId)) continue;
    const connectedAt = integration.connected_at || integration.created_at;
    const counts = { created: 0, updated: 0, payments: 0 };
    summary[orgId] = counts;

    try {
      // 1. Issued invoices created since connecting that never reached QuickBooks.
      const { data: toCreateRaw } = await db
        .from("crm_invoices")
        .select("id, updated_at, qbo_sync_error, qbo_sync_attempted_at, clients(updated_at)")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .is("qbo_invoice_id", null)
        .in("status", ISSUED_STATUSES)
        .gte("created_at", connectedAt)
        .lt("updated_at", settledBefore)
        .or(`qbo_sync_attempted_at.is.null,qbo_sync_attempted_at.lt.${retryBefore}`)
        .order("created_at", { ascending: true })
        .limit(MAX_CREATES);
      // A client whose name exists as a vendor/employee in QuickBooks can't be created there
      // until someone renames or links it: don't retry that invoice every run, only once the
      // invoice or its client has been edited since the failed attempt.
      type CreateRow = { id: string; updated_at: string; qbo_sync_error: string | null; qbo_sync_attempted_at: string | null; clients: { updated_at: string } | null };
      const toCreate = ((toCreateRaw ?? []) as CreateRow[]).filter((r) => {
        if (r.qbo_sync_error !== QBO_DUPLICATE_NAME_MESSAGE || !r.qbo_sync_attempted_at) return true;
        const lastEdit = [r.updated_at, r.clients?.updated_at ?? ""].sort().pop() ?? "";
        return lastEdit > r.qbo_sync_attempted_at;
      });
      for (const row of toCreate) {
        if (overBudget()) { stoppedEarly = true; break; }
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
      // Failed rows due a retry, oldest attempt first. The window above is the most recently
      // updated invoices only, so with enough recent in-sync invoices an older failed one would
      // never be seen — and never retried.
      const { data: failedDue } = await db
        .from("crm_invoices")
        .select("id, updated_at, qbo_sync_attempted_at, qbo_sync_error")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .not("qbo_invoice_id", "is", null)
        .not("qbo_sync_error", "is", null)
        .lt("qbo_sync_attempted_at", retryBefore)
        .lt("updated_at", settledBefore)
        .order("qbo_sync_attempted_at", { ascending: true })
        .limit(MAX_UPDATES);
      type SyncedRow = { id: string; updated_at: string; qbo_sync_attempted_at: string | null; qbo_sync_error: string | null };
      const candidates = new Map<string, SyncedRow>();
      for (const r of [...((synced ?? []) as SyncedRow[]), ...((failedDue ?? []) as SyncedRow[])]) candidates.set(r.id, r);
      const changed = [...candidates.values()]
        .filter((r) => {
          const attempted = r.qbo_sync_attempted_at ? Date.parse(r.qbo_sync_attempted_at) : 0;
          if (!attempted || Date.parse(r.updated_at) > attempted + CHANGED_SLACK_MS) return true;
          return !!r.qbo_sync_error && attempted < Date.parse(retryBefore);
        })
        .slice(0, MAX_UPDATES);
      for (const row of changed) {
        if (overBudget()) { stoppedEarly = true; break; }
        const result = await pushInvoiceToQuickBooks(db, orgId, row.id);
        if (result.status === "updated" || result.status === "voided") counts.updated++;
        if (result.reason === "not_connected") break;
      }

      // 3. Payments applied since connecting whose invoice is in QuickBooks but which aren't.
      //    By allocation date: a prepayment recorded before connecting but applied afterwards
      //    is new to QuickBooks.
      const { data: allocations } = await db
        .from("crm_payment_allocations")
        .select("payment_id, qbo_sync_attempted_at, crm_invoices!inner(qbo_invoice_id), crm_payments!inner(deleted_at, is_credit)")
        .eq("org_id", orgId)
        .is("qbo_payment_id", null)
        .not("crm_invoices.qbo_invoice_id", "is", null)
        .is("crm_payments.deleted_at", null)
        .gte("created_at", connectedAt)
        .lt("created_at", settledBefore)
        // Never-attempted first, then the longest-waiting: an unordered limit kept returning the
        // same rows, so the rest were never reached.
        .order("qbo_sync_attempted_at", { ascending: true, nullsFirst: true })
        .limit(MAX_PAYMENTS * 3);
      const paymentIds = new Set<string>();
      for (const a of (allocations ?? []) as { payment_id: string; qbo_sync_attempted_at: string | null }[]) {
        if (a.qbo_sync_attempted_at && a.qbo_sync_attempted_at > retryBefore) continue;
        paymentIds.add(a.payment_id);
        if (paymentIds.size >= MAX_PAYMENTS) break;
      }
      for (const paymentId of paymentIds) {
        if (overBudget()) { stoppedEarly = true; break; }
        const result = await pushPaymentToQuickBooks(db, orgId, paymentId);
        if (result.status === "pushed") counts.payments++;
        if (result.reason === "not_connected") break;
      }

      // 3b. Payments already in QuickBooks that changed here since (an edited amount, date or
      //     reference, a lowered invoice total, a failed refund update): update them there.
      const { data: flaggedLinks } = await db
        .from("crm_payment_allocations")
        .select("payment_id, qbo_sync_attempted_at")
        .eq("org_id", orgId)
        .not("qbo_payment_id", "is", null)
        .not("qbo_sync_error", "is", null)
        .or(`qbo_sync_attempted_at.is.null,qbo_sync_attempted_at.lt.${retryBefore}`)
        .order("qbo_sync_attempted_at", { ascending: true, nullsFirst: true })
        .limit(MAX_PAYMENTS * 3);
      const changedPaymentIds = new Set<string>();
      for (const a of (flaggedLinks ?? []) as { payment_id: string }[]) {
        if (paymentIds.has(a.payment_id)) continue;
        changedPaymentIds.add(a.payment_id);
        if (changedPaymentIds.size >= MAX_PAYMENTS) break;
      }
      for (const paymentId of changedPaymentIds) {
        if (overBudget()) { stoppedEarly = true; break; }
        const result = await syncPaymentToQuickBooks(db, orgId, paymentId);
        if (result.status === "pushed") counts.payments++;
        if (result.reason === "not_connected") break;
      }

      // 4. Voids queued when an allocation in QuickBooks went away here: a refund in full whose
      //    void failed, an edit that moved a payment to another invoice, a lowered invoice total.
      if (!overBudget()) await retryPendingQuickBooksVoids(db, orgId);
    } catch (err) {
      log.error("QuickBooks sync sweep failed for org", { err, orgId });
    }
  }

  if (stoppedEarly) log.warn("QuickBooks sweep stopped at its time budget; the next run continues", { orgs: Object.keys(summary).length });
  return NextResponse.json({ ok: true, stoppedEarly, orgs: summary });
}
