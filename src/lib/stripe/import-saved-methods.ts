import type Stripe from "stripe";
import { summarizePaymentMethod } from "@/lib/stripe/saved-payment-methods";

/**
 * Importing already-saved cards/bank accounts from a Stripe account the org
 * linked via OAuth (e.g. one they previously used with another CRM). Customers
 * and PaymentMethods live on the connected account, so after linking they are
 * visible to us — they just aren't attached to any Landscapt client yet.
 */

/** Hard cap so a runaway account can't turn one click into an unbounded crawl. */
const MAX_CUSTOMERS = 5000;
const PM_LOOKUP_CONCURRENCY = 10;

export type ImportableMethodType = "card" | "us_bank_account";

export interface StripeCustomerMethod {
  customerId: string;
  name: string | null;
  email: string | null;
  method: {
    id: string;
    type: ImportableMethodType;
    summary: string;
    expired: boolean;
  } | null;
}

export interface ImportClientRow {
  id: string;
  display_name: string;
  primary_email: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  saved_payment_method_id: string | null;
  saved_payment_method_summary: string | null;
}

export type ImportRowStatus =
  | "ready" // matched to exactly one client that has no method on file
  | "already_saved" // matched client already has a method on file — never overwritten
  | "ambiguous" // more than one client (or customer) could be the match
  | "no_client"; // nothing in Landscapt looks like this customer

export interface ImportPreviewRow {
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  method: StripeCustomerMethod["method"];
  status: ImportRowStatus;
  /** How the client was found. Email is exact; name is a normalized-equality guess. */
  matchedBy: "email" | "name" | null;
  client: { id: string; name: string; existingSummary: string | null } | null;
  /** Human-readable reason for non-ready rows. */
  note: string | null;
}

function isImportableType(type: string): type is ImportableMethodType {
  return type === "card" || type === "us_bank_account";
}

function isExpired(pm: Stripe.PaymentMethod): boolean {
  if (pm.type !== "card" || !pm.card) return false;
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return pm.card.exp_year < year || (pm.card.exp_year === year && pm.card.exp_month < month);
}

function toMethod(pm: Stripe.PaymentMethod): NonNullable<StripeCustomerMethod["method"]> | null {
  if (!isImportableType(pm.type)) return null;
  return { id: pm.id, type: pm.type, summary: summarizePaymentMethod(pm), expired: isExpired(pm) };
}

/** Picks the customer's default method if usable, otherwise the newest usable one
 * (non-expired preferred). `listPaymentMethods` returns newest first. */
function pickMethod(
  defaultPm: Stripe.PaymentMethod | null,
  all: Stripe.PaymentMethod[]
): StripeCustomerMethod["method"] {
  if (defaultPm) {
    const m = toMethod(defaultPm);
    if (m && !m.expired) return m;
  }
  const usable = all.map(toMethod).filter((m): m is NonNullable<typeof m> => m !== null);
  return usable.find((m) => !m.expired) ?? usable[0] ?? null;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Resolves the importable method for one customer on the connected account.
 * Returns null if the customer doesn't exist/was deleted, `method: null` if it has nothing usable. */
export async function resolveCustomerMethod(
  stripe: Stripe,
  connectedAccountId: string,
  customerId: string
): Promise<StripeCustomerMethod | null> {
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(
      customerId,
      { expand: ["invoice_settings.default_payment_method"] },
      { stripeAccount: connectedAccountId }
    );
  } catch {
    return null;
  }
  if (customer.deleted) return null;
  const defaultPm =
    customer.invoice_settings?.default_payment_method && typeof customer.invoice_settings.default_payment_method !== "string"
      ? customer.invoice_settings.default_payment_method
      : null;
  const list = await stripe.customers.listPaymentMethods(customerId, { limit: 10 }, { stripeAccount: connectedAccountId });
  return {
    customerId: customer.id,
    name: customer.name ?? null,
    email: customer.email ?? null,
    method: pickMethod(defaultPm, list.data),
  };
}

/** Lists every (non-deleted) Stripe customer on the connected account with its best importable method. */
export async function listStripeCustomerMethods(
  stripe: Stripe,
  connectedAccountId: string
): Promise<{ customers: StripeCustomerMethod[]; truncated: boolean }> {
  const base: Array<{ customer: Stripe.Customer; defaultPm: Stripe.PaymentMethod | null }> = [];
  let truncated = false;
  for await (const customer of stripe.customers.list(
    { limit: 100, expand: ["data.invoice_settings.default_payment_method"] },
    { stripeAccount: connectedAccountId }
  )) {
    if (base.length >= MAX_CUSTOMERS) {
      truncated = true;
      break;
    }
    const d = customer.invoice_settings?.default_payment_method;
    base.push({ customer, defaultPm: d && typeof d !== "string" ? d : null });
  }

  const customers = await mapWithConcurrency(base, PM_LOOKUP_CONCURRENCY, async ({ customer, defaultPm }) => {
    const defaultMethod = defaultPm ? toMethod(defaultPm) : null;
    // A usable, non-expired default is the answer — skip the extra round trip.
    if (defaultMethod && !defaultMethod.expired) {
      return { customerId: customer.id, name: customer.name ?? null, email: customer.email ?? null, method: defaultMethod };
    }
    try {
      const list = await stripe.customers.listPaymentMethods(customer.id, { limit: 10 }, { stripeAccount: connectedAccountId });
      return {
        customerId: customer.id,
        name: customer.name ?? null,
        email: customer.email ?? null,
        method: pickMethod(defaultPm, list.data),
      };
    } catch {
      return { customerId: customer.id, name: customer.name ?? null, email: customer.email ?? null, method: null };
    }
  });
  return { customers, truncated };
}

const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const normName = (n: string | null | undefined) => (n ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Pure matcher: pairs Stripe customers (that have a usable method) with Landscapt clients. Email is
 * trusted; an exact normalized-name match is offered as a lower-confidence guess. A client is claimed by at
 * most one customer so two Stripe records for the same person can't both write to it. */
export function matchCustomersToClients(customers: StripeCustomerMethod[], clients: ImportClientRow[]): ImportPreviewRow[] {
  const byEmail = new Map<string, ImportClientRow[]>();
  const byName = new Map<string, ImportClientRow[]>();
  for (const c of clients) {
    for (const email of new Set([normEmail(c.primary_email), normEmail(c.billing_email)])) {
      if (!email) continue;
      const arr = byEmail.get(email) ?? [];
      arr.push(c);
      byEmail.set(email, arr);
    }
    const n = normName(c.display_name);
    if (n) {
      const arr = byName.get(n) ?? [];
      arr.push(c);
      byName.set(n, arr);
    }
  }

  const withMethod = customers.filter((c) => c.method);
  const claimed = new Set<string>();
  const rows: ImportPreviewRow[] = [];

  // Two passes so an email match always wins a client before a name guess can take it.
  const resolved = new Map<string, { candidates: ImportClientRow[]; by: "email" | "name" | null }>();
  for (const cust of withMethod) {
    const e = normEmail(cust.email);
    const emailHits = e ? byEmail.get(e) ?? [] : [];
    if (emailHits.length > 0) {
      resolved.set(cust.customerId, { candidates: emailHits, by: "email" });
      continue;
    }
    const nameHits = normName(cust.name) ? byName.get(normName(cust.name)) ?? [] : [];
    resolved.set(cust.customerId, { candidates: nameHits, by: nameHits.length > 0 ? "name" : null });
  }

  for (const pass of ["email", "name", null] as const) {
    for (const cust of withMethod) {
      const r = resolved.get(cust.customerId)!;
      if (r.by !== pass) continue;
      const base = { customerId: cust.customerId, customerName: cust.name, customerEmail: cust.email, method: cust.method };

      if (r.candidates.length === 0) {
        rows.push({ ...base, status: "no_client", matchedBy: null, client: null, note: "No client with this email or name" });
        continue;
      }
      if (r.candidates.length > 1) {
        rows.push({
          ...base,
          status: "ambiguous",
          matchedBy: r.by,
          client: null,
          note: `${r.candidates.length} clients share this ${r.by} — link manually`,
        });
        continue;
      }
      const client = r.candidates[0];
      const clientRef = { id: client.id, name: client.display_name, existingSummary: client.saved_payment_method_summary };
      if (client.saved_payment_method_id) {
        rows.push({ ...base, status: "already_saved", matchedBy: r.by, client: clientRef, note: "Client already has a method on file" });
        continue;
      }
      if (claimed.has(client.id)) {
        rows.push({
          ...base,
          status: "ambiguous",
          matchedBy: r.by,
          client: clientRef,
          note: "Another Stripe customer already matches this client",
        });
        continue;
      }
      claimed.add(client.id);
      rows.push({
        ...base,
        status: "ready",
        matchedBy: r.by,
        client: clientRef,
        note: cust.method?.expired ? "Card is expired" : null,
      });
    }
  }
  return rows;
}
