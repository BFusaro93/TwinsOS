import { redirect } from "next/navigation";
import { getPortalAccounts, getPortalContext, subAccountNames } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import PortalBillingPage from "@/components/portal/PortalBillingPage";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { byColumn, queryByClientIds } from "@/lib/portal/client-id-chunks";

interface InvoiceRow {
  id: string;
  client_id: string;
  invoice_number: number;
  total_cents: number;
  balance_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  status: string;
  created_at: string;
}

interface PaymentRow {
  id: string;
  client_id: string;
  invoice_id: string | null;
  amount_cents: number;
  refunded_amount_cents: number;
  unused_amount_cents: number;
  payment_date: string;
  method: string;
  is_credit: boolean;
  is_prepayment: boolean;
  created_at: string;
}

export default async function BillingPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  // A parent client's login also sees (and can pay) its sub-accounts' invoices.
  const accounts = await getPortalAccounts(ctx);
  const clientIds = accounts.map((a) => a.id);
  const accountNames = subAccountNames(accounts);

  const cols = "id, client_id, invoice_number, total_cents, balance_cents, amount_paid_cents, due_date, status, created_at";
  // Recent history is capped, but anything still owing is always included —
  // otherwise a customer with 50+ newer invoices could not see (or pay) an
  // older unpaid one.
  const [recentRes, owingRes] = await Promise.all([
    queryByClientIds<InvoiceRow>(
      clientIds,
      (ids) =>
        supabase
          .from("crm_invoices")
          .select(cols)
          .in("client_id", ids)
          .eq("org_id", ctx.orgId)
          // Drafts are unfinished staff work — never shown to the customer.
          .neq("status", "draft")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(50) as unknown as Promise<{ data: InvoiceRow[] | null; error: unknown }>,
      { compare: byColumn("created_at", false), limit: 50 }
    ),
    queryByClientIds<InvoiceRow>(clientIds, (ids) =>
      supabase
        .from("crm_invoices")
        .select(cols)
        .in("client_id", ids)
        .eq("org_id", ctx.orgId)
        .in("status", ["printed", "sent", "viewed", "partial", "overdue"])
        .gt("balance_cents", 0)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }) as unknown as Promise<{ data: InvoiceRow[] | null; error: unknown }>
    ),
  ]);
  const error = recentRes.error ?? owingRes.error;
  const merged = new Map<string, InvoiceRow>();
  for (const inv of [...(recentRes.data ?? []), ...(owingRes.data ?? [])]) merged.set(inv.id, inv);
  const invoices = [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (error) console.error("[portal/billing]", error);

  // Payments and credits, each with the invoices it was applied to ("Load
  // Invoices" in SA's portal). Internal write-offs aren't a customer's payment.
  const paymentsRes = await queryByClientIds<PaymentRow>(
    clientIds,
    (ids) =>
      supabase
        .from("crm_payments")
        .select("id, client_id, invoice_id, amount_cents, refunded_amount_cents, unused_amount_cents, payment_date, method, is_credit, is_prepayment, created_at")
        .in("client_id", ids)
        .eq("org_id", ctx.orgId)
        .neq("method", "AR Write-off")
        .is("deleted_at", null)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50) as unknown as Promise<{ data: PaymentRow[] | null; error: unknown }>,
    { compare: byColumn("created_at", false), limit: 50 }
  );
  if (paymentsRes.error) console.error("[portal/billing payments]", paymentsRes.error);
  const paymentRows = [...(paymentsRes.data ?? [])]
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
  const paymentIds = paymentRows.map((p) => p.id);
  const { data: allocRows } = paymentIds.length
    ? await supabase
        .from("crm_payment_allocations")
        .select("payment_id, invoice_id, amount_cents")
        .in("payment_id", paymentIds)
        .eq("org_id", ctx.orgId)
    : { data: [] as { payment_id: string; invoice_id: string; amount_cents: number }[] };
  const invoiceIdSet = new Set<string>();
  for (const a of allocRows ?? []) invoiceIdSet.add(a.invoice_id);
  for (const p of paymentRows) if (p.invoice_id) invoiceIdSet.add(p.invoice_id);
  const { data: numberRows } = invoiceIdSet.size
    ? await supabase.from("crm_invoices").select("id, invoice_number").in("id", [...invoiceIdSet]).eq("org_id", ctx.orgId)
    : { data: [] as { id: string; invoice_number: number | null }[] };
  const numberById = new Map((numberRows ?? []).map((r) => [r.id, r.invoice_number]));
  const payments = paymentRows.map((p) => {
    const allocs = (allocRows ?? []).filter((a) => a.payment_id === p.id);
    // Older payments predate the allocation table and only carry invoice_id.
    const applied =
      allocs.length > 0
        ? allocs.map((a) => ({ invoiceId: a.invoice_id, invoiceNumber: numberById.get(a.invoice_id) ?? null, amountCents: a.amount_cents }))
        : p.invoice_id
          ? [{ invoiceId: p.invoice_id, invoiceNumber: numberById.get(p.invoice_id) ?? null, amountCents: p.amount_cents }]
          : [];
    return {
      id: p.id,
      date: p.payment_date,
      method: p.method,
      amountCents: p.amount_cents,
      refundedCents: p.refunded_amount_cents ?? 0,
      unusedCents: p.unused_amount_cents ?? 0,
      isCredit: p.is_credit,
      isPrepayment: p.is_prepayment,
      accountName: accountNames.get(p.client_id) ?? null,
      applied,
    };
  });

  // Past-due is judged on the service provider's calendar, like the rest of
  // the portal, not the server's UTC day or the viewer's.
  const today = todayInZone(await getOrgTimeZone(supabase, ctx.orgId));

  return (
    <PortalBillingPage
      invoices={invoices.map((inv) => ({ ...inv, accountName: accountNames.get(inv.client_id) ?? null }))}
      today={today}
      payments={payments}
      accounts={accounts.map((a) => ({ id: a.id, displayName: a.displayName, isSelf: a.isSelf }))}
    />
  );
}
