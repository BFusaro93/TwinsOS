import { selectAllRows } from "@/lib/visits/generate";
import { AR_WRITE_OFF_METHOD } from "@/lib/reports/helpers";
import type { AccountStatementActivityRow, AccountStatementGroup } from "@/components/crm/invoices/pdf/AccountStatementDocument";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface AccountStatementData {
  accountNumber: string | null;
  /** Every open/closed invoice and payment/credit dated before `fromDate`,
   *  collapsed into a single running total — same "Balance Forward" concept
   *  as the paper statement format this mirrors. For a parent account this is
   *  the total across its own and its sub-accounts' activity. */
  balanceForwardCents: number;
  rows: AccountStatementActivityRow[];
  /** Total amount due — for a parent account, its own plus every sub-account's. */
  endingBalanceCents: number;
  lastPayment: { amountCents: number; date: string; reference: string | null } | null;
  /** One section per account on the statement: the account itself first, then each
   *  sub-account with activity (parent accounts only). A single entry for an account
   *  with no sub-accounts. */
  groups: AccountStatementGroup[];
}

type Row = Record<string, unknown>;

interface InvoiceRef {
  client_id?: string | null;
  invoice_number?: number | null;
  status?: string;
  deleted_at?: string | null;
}

interface PaymentRef {
  id: string;
  payment_date: string;
  amount_cents: number | null;
  refunded_amount_cents: number | null;
  method: string | null;
  reference: string | null;
  is_credit: boolean | null;
  client_id: string;
}

const isIssued = (inv: InvoiceRef | null | undefined): boolean =>
  !!inv && inv.status !== "void" && inv.status !== "draft" && !inv.deleted_at;

/** An allocation's share of a payment, net of refunds (pro rata). */
function netShare(shareCents: number, pay: { amount_cents: number | null; refunded_amount_cents: number | null }): number {
  const gross = pay.amount_cents ?? 0;
  const refunded = pay.refunded_amount_cents ?? 0;
  return gross > 0 ? Math.round((shareCents * (gross - refunded)) / gross) : shareCents;
}

/** Reconstructs a client's account activity as a dated, running-balance
 *  ledger for the statement PDF — merges invoices (charges) and
 *  payments/credits (reductions) sorted by date, the same way the org's
 *  paper statements already present activity. Only invoices/payments up to
 *  `toDate` are considered; the running balance as of `toDate` is what a
 *  mailed statement would show.
 *
 *  A PARENT account's statement rolls up its sub-accounts: their invoices and
 *  payments are included, grouped by sub-account, with one total due — the
 *  parent's own statement used to list the parent's payments that paid its
 *  sub-accounts' invoices without those invoices, understating what it owes.
 *  A sub-account's own statement still shows only its own activity, with
 *  payments made by its parent as "Paid by parent account". */
export async function buildAccountStatementData(
  supabase: AnyClient,
  params: { clientId: string; orgId: string; fromDate: string; toDate: string }
): Promise<AccountStatementData> {
  const { clientId, fromDate, toDate } = params;

  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, display_name, account_number, service_address, service_city")
    .eq("id", clientId)
    .maybeSingle();

  const { data: childRows, error: childErr } = await supabase
    .from("clients")
    .select("id, display_name, service_address, service_city")
    .eq("parent_client_id", clientId)
    .is("deleted_at", null)
    .order("display_name");
  if (childErr) throw new Error(`Failed to load sub-accounts for statement: ${childErr.message ?? childErr}`);

  const children = (childRows ?? []) as Row[];
  const rolledUp = children.length > 0;
  const accounts: { id: string; name: string; address: string | null; isMain: boolean }[] = [
    {
      id: clientId,
      name: (clientRow?.display_name as string | null) ?? "Account",
      address: addressOf(clientRow as Row | null),
      isMain: true,
    },
    ...children.map((c) => ({ id: c.id as string, name: (c.display_name as string) ?? "Sub-account", address: addressOf(c), isMain: false })),
  ];
  const ids = accounts.map((a) => a.id);
  const inSet = new Set(ids);

  const { rows: invoiceRows, error: invoiceErr } = await selectAllRows<Row>(() => supabase
    .from("crm_invoices")
    .select("id, client_id, invoice_number, invoice_date, description, total_cents")
    .in("client_id", ids)
    .neq("status", "void")
    .neq("status", "draft")
    .is("deleted_at", null)
    .lte("invoice_date", toDate));

  if (invoiceErr) throw new Error(`Failed to load invoices for statement: ${invoiceErr}`);

  // Payments applied to a void/draft invoice must not reduce the balance: that
  // invoice is excluded from charges above. Join the invoice's status/deleted_at
  // to drop them (payments with no invoice, e.g. unapplied credits, stay).
  const { rows: rawPaymentRows, error: paymentErr } = await selectAllRows<Row>(() => supabase
    .from("crm_payments")
    .select("id, client_id, payment_date, amount_cents, refunded_amount_cents, method, reference, is_credit, invoice_id, crm_invoices!crm_payments_invoice_id_fkey(client_id, invoice_number, status, deleted_at)")
    .in("client_id", ids)
    .is("deleted_at", null)
    .lte("payment_date", toDate));

  if (paymentErr) throw new Error(`Failed to load payments for statement: ${paymentErr}`);

  const paymentRows = rawPaymentRows.filter((r) => {
    if (!r.invoice_id) return true;
    const inv = r.crm_invoices as InvoiceRef | null;
    if (!inv) return true;
    return isIssued(inv);
  });

  // Every allocation onto these accounts' invoices. Allocations from a payment
  // recorded on ANOTHER account (typically the parent) reduce what these
  // accounts owe — omitting them overstated a sub-account's balance by every
  // such payment. Allocations from these accounts' own payments tell a rolled-up
  // statement which sub-account each payment paid.
  const { rows: allocRows, error: allocErr } = await selectAllRows<Row>(() => supabase
    .from("crm_payment_allocations")
    .select("payment_id, amount_cents, crm_invoices!inner(client_id, invoice_number, status, deleted_at), crm_payments!inner(id, payment_date, amount_cents, refunded_amount_cents, method, reference, is_credit, client_id, deleted_at)")
    .in("crm_invoices.client_id", ids)
    .is("crm_payments.deleted_at", null)
    .lte("crm_payments.payment_date", toDate));
  if (allocErr) throw new Error(`Failed to load payment allocations for statement: ${allocErr}`);

  const issuedAllocs = allocRows.filter((r) => !!r.crm_payments && isIssued(r.crm_invoices as InvoiceRef));
  const paidFromOutside = issuedAllocs.filter((r) => !inSet.has((r.crm_payments as PaymentRef).client_id));
  const ownAllocsByPayment = new Map<string, Row[]>();
  for (const r of issuedAllocs) {
    const pay = r.crm_payments as PaymentRef;
    if (!inSet.has(pay.client_id)) continue;
    const list = ownAllocsByPayment.get(pay.id) ?? [];
    list.push(r);
    ownAllocsByPayment.set(pay.id, list);
  }

  type LedgerEntry = {
    groupId: string;
    date: string;
    kind: "invoice" | "payment" | "credit";
    label: string;
    invoiceNumber: number | null;
    amountCents: number; // signed: +charge, -payment/credit
  };

  const paymentLabel = (r: Row, invoiceNumber: number | null): string => {
    const isCredit = r.is_credit === true;
    return isCredit
      ? `Credit${r.reference ? ` (Ref #: ${r.reference})` : ""}`
      : `Payment — ${r.method}${invoiceNumber ? ` (Invoice #${invoiceNumber})` : ""}${r.reference ? ` (Ref #: ${r.reference})` : ""}`;
  };

  const entries: LedgerEntry[] = [
    ...invoiceRows.map((r): LedgerEntry => ({
      groupId: r.client_id as string,
      date: r.invoice_date as string,
      kind: "invoice",
      label: `Invoice #${r.invoice_number}${r.description ? ` — ${r.description}` : ""}`,
      invoiceNumber: r.invoice_number as number,
      amountCents: (r.total_cents as number) ?? 0,
    })),
    ...paymentRows.flatMap((r): LedgerEntry[] => {
      const kind = r.is_credit === true ? "credit" : "payment";
      const payerId = r.client_id as string;
      // Net of refunds: a refunded payment no longer reduces what's owed.
      const net = ((r.amount_cents as number) ?? 0) - ((r.refunded_amount_cents as number) ?? 0);
      const fkInvoice = r.crm_invoices as InvoiceRef | null;
      const allocs = rolledUp ? ownAllocsByPayment.get(r.id as string) ?? [] : [];
      if (allocs.length === 0) {
        // One account (or a payment with no split on record): the whole payment on the
        // account it paid — its invoice's account when that's one of these, else the payer.
        const groupId = rolledUp && fkInvoice?.client_id && inSet.has(fkInvoice.client_id) ? fkInvoice.client_id : payerId;
        const invoiceNumber = fkInvoice?.invoice_number ?? null;
        return [{ groupId, date: r.payment_date as string, kind, label: paymentLabel(r, invoiceNumber), invoiceNumber, amountCents: -net }];
      }
      // Rolled up: split the payment over the accounts whose invoices it paid; anything not
      // applied to them stays on the paying account.
      const out: LedgerEntry[] = [];
      let applied = 0;
      for (const a of allocs) {
        const inv = a.crm_invoices as InvoiceRef;
        const share = netShare((a.amount_cents as number) ?? 0, r as unknown as PaymentRef);
        applied += share;
        out.push({
          groupId: inv.client_id as string,
          date: r.payment_date as string,
          kind,
          label: paymentLabel(r, inv.invoice_number ?? null),
          invoiceNumber: inv.invoice_number ?? null,
          amountCents: -share,
        });
      }
      const rest = net - applied;
      if (rest !== 0) {
        out.push({ groupId: payerId, date: r.payment_date as string, kind, label: paymentLabel(r, null), invoiceNumber: null, amountCents: -rest });
      }
      return out;
    }),
    ...paidFromOutside.map((r): LedgerEntry => {
      const pay = r.crm_payments as PaymentRef;
      const inv = r.crm_invoices as InvoiceRef;
      const net = netShare((r.amount_cents as number) ?? 0, pay);
      return {
        groupId: inv.client_id as string,
        date: pay.payment_date,
        kind: "payment",
        label: `${rolledUp ? "Paid by another account" : "Paid by parent account"} — ${pay.method ?? "Payment"}${inv.invoice_number ? ` (Invoice #${inv.invoice_number})` : ""}${pay.reference ? ` (Ref #: ${pay.reference})` : ""}`,
        invoiceNumber: inv.invoice_number ?? null,
        amountCents: -net,
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const ledger = (list: LedgerEntry[]) => {
    let running = 0;
    let balanceForwardCents = 0;
    const rows: AccountStatementActivityRow[] = [];
    for (const e of list) {
      running += e.amountCents;
      if (e.date < fromDate) {
        balanceForwardCents = running;
        continue;
      }
      rows.push({
        date: e.date,
        kind: e.kind,
        label: e.label,
        invoiceNumber: e.invoiceNumber,
        amountCents: e.amountCents,
        balanceCents: running,
      });
    }
    return { balanceForwardCents, rows, endingBalanceCents: running };
  };

  const overall = ledger(entries);
  const groups: AccountStatementGroup[] = accounts
    .map((acct) => {
      const g = ledger(entries.filter((e) => e.groupId === acct.id));
      return { clientId: acct.id, name: acct.name, address: acct.address, isMainAccount: acct.isMain, ...g };
    })
    // The account itself always; a sub-account only when it has something to show.
    .filter((g) => g.isMainAccount || g.rows.length > 0 || g.balanceForwardCents !== 0 || g.endingBalanceCents !== 0);

  // Cash only, like the invoice-statement layout: an AR write-off zeroes bad
  // debt without money changing hands, so it must never print as the client's
  // "last payment".
  const lastPaymentRow = [...paymentRows]
    .filter((r) => r.is_credit !== true && r.method !== AR_WRITE_OFF_METHOD)
    .sort((a, b) => (b.payment_date as string).localeCompare(a.payment_date as string))[0];

  return {
    accountNumber: (clientRow?.account_number as string | null) ?? null,
    balanceForwardCents: overall.balanceForwardCents,
    rows: overall.rows,
    endingBalanceCents: overall.endingBalanceCents,
    lastPayment: lastPaymentRow
      ? {
          amountCents: (lastPaymentRow.amount_cents as number) ?? 0,
          date: lastPaymentRow.payment_date as string,
          reference: (lastPaymentRow.reference as string | null) ?? null,
        }
      : null,
    groups,
  };
}

function addressOf(row: Row | null): string | null {
  if (!row) return null;
  const parts = [row.service_address, row.service_city].filter((p) => typeof p === "string" && p.trim()) as string[];
  return parts.length ? parts.join(", ") : null;
}
