import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import {
  listStripeCustomerMethods,
  matchCustomersToClients,
  resolveCustomerMethod,
  type ImportClientRow,
} from "@/lib/stripe/import-saved-methods";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { rejectIfImpersonating } from "@/lib/auth/impersonation-guard";
import { logger } from "@/lib/logger";

const log = logger.child("stripe import saved methods");

// Listing every customer + their methods is one Stripe round trip per customer.
export const maxDuration = 300;

const PAGE = 1000;
const APPLY_CONCURRENCY = 5;

type Gate =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      orgId: string;
      accountId: string;
      livemode: boolean | null;
      supabase: Awaited<ReturnType<typeof createClient>>;
    };

/** Same gate as saving a card by hand (acct_add_modify_payments), plus a fully
 * onboarded connected account — importing methods is bulk-saving them. */
async function gate(): Promise<Gate> {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return { ok: false, response: NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 }) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return { ok: false, response: NextResponse.json({ error: "Profile not found" }, { status: 403 }) };

  const impersonating = await rejectIfImpersonating(supabase, user.id, "importing saved payment methods");
  if (impersonating) return { ok: false, response: impersonating };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canManagePayments } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "acct_add_modify_payments",
  });
  if (!canManagePayments) {
    return {
      ok: false,
      response: NextResponse.json({ error: "You don't have permission to manage saved payment methods" }, { status: 403 }),
    };
  }

  // stripe_connect_livemode isn't in the generated Supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase.from("organizations") as any)
    .select("stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_livemode")
    .eq("id", profile.org_id)
    .single();
  if (!org) return { ok: false, response: NextResponse.json({ error: "Organization not found" }, { status: 404 }) };
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Connect your Stripe account in Settings before importing payment methods." }, { status: 400 }),
    };
  }
  return {
    ok: true,
    orgId: profile.org_id,
    accountId: org.stripe_connect_account_id,
    livemode: org.stripe_connect_livemode ?? null,
    supabase,
  };
}

async function loadClients(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<ImportClientRow[]> {
  const rows: ImportClientRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, display_name, primary_email, billing_email, stripe_customer_id, saved_payment_method_id, saved_payment_method_summary")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as ImportClientRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Dry run: nothing is written. Returns each Stripe customer that has a usable saved method and how it matched. */
export async function GET() {
  const g = await gate();
  if (!g.ok) return g.response;

  const stripe = getStripeForOrg(g.livemode);
  try {
    const [{ customers, truncated }, clients] = await Promise.all([
      listStripeCustomerMethods(stripe, g.accountId),
      loadClients(g.supabase, g.orgId),
    ]);
    const rows = matchCustomersToClients(customers, clients);
    return NextResponse.json({
      rows,
      totalCustomers: customers.length,
      customersWithoutMethod: customers.filter((c) => !c.method).length,
      truncated,
    });
  } catch (err) {
    return stripeErrorResponse(err, log, { orgId: g.orgId, connectedAccountId: g.accountId });
  }
}

const ApplySchema = z.object({
  links: z
    .array(z.object({ customerId: z.string().min(1), clientId: z.string().uuid() }))
    .min(1)
    .max(1000),
  enableAutopay: z.boolean().default(false),
});

interface LinkResult {
  customerId: string;
  clientId: string;
  ok: boolean;
  summary?: string;
  error?: string;
}

/** Attaches the chosen Stripe customers' saved methods to the chosen clients. The server re-reads each
 * customer/method from Stripe rather than trusting anything the browser sent beyond the two ids. */
export async function POST(request: Request) {
  const g = await gate();
  if (!g.ok) return g.response;
  const { orgId, accountId, livemode, supabase } = g;

  const parsed = ApplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { links, enableAutopay } = parsed.data;

  const clientIds = links.map((l) => l.clientId);
  const customerIds = links.map((l) => l.customerId);
  if (new Set(clientIds).size !== clientIds.length || new Set(customerIds).size !== customerIds.length) {
    return NextResponse.json({ error: "Each client and each Stripe customer can only be linked once per import." }, { status: 400 });
  }

  const { data: clientRows, error: clientErr } = await supabase
    .from("clients")
    .select("id, saved_payment_method_id")
    .in("id", clientIds)
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (clientErr) return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  const clientById = new Map((clientRows ?? []).map((c) => [c.id, c]));

  // A Stripe customer already tied to a different client here would end up shared by two records.
  const { data: inUse } = await supabase
    .from("clients")
    .select("id, stripe_customer_id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .in("stripe_customer_id", customerIds);
  const customerOwner = new Map((inUse ?? []).map((c) => [c.stripe_customer_id as string, c.id]));

  const stripe = getStripeForOrg(livemode);
  const service = createServiceClient();

  async function applyOne(link: { customerId: string; clientId: string }): Promise<LinkResult> {
    const base = { customerId: link.customerId, clientId: link.clientId };
    const client = clientById.get(link.clientId);
    if (!client) return { ...base, ok: false, error: "Client not found" };
    if (client.saved_payment_method_id) return { ...base, ok: false, error: "Client already has a method on file" };
    const owner = customerOwner.get(link.customerId);
    if (owner && owner !== link.clientId) return { ...base, ok: false, error: "Stripe customer is already linked to another client" };

    try {
      const resolved = await resolveCustomerMethod(stripe, accountId, link.customerId);
      if (!resolved) return { ...base, ok: false, error: "Stripe customer no longer exists" };
      if (!resolved.method) return { ...base, ok: false, error: "Stripe customer has no usable card or bank account" };
      if (resolved.method.expired) return { ...base, ok: false, error: "Saved card is expired" };

      const { error } = await service
        .from("clients")
        .update({
          stripe_customer_id: resolved.customerId,
          saved_payment_method_id: resolved.method.id,
          saved_payment_method_type: resolved.method.type,
          saved_payment_method_summary: resolved.method.summary,
          autopay_enabled: enableAutopay,
        })
        .eq("id", link.clientId)
        .eq("org_id", orgId)
        // Re-assert the precondition so a concurrent manual save isn't overwritten.
        .is("saved_payment_method_id", null);
      if (error) {
        log.error("failed to save imported payment method", { error, clientId: link.clientId });
        return { ...base, ok: false, error: "Failed to save" };
      }
      return { ...base, ok: true, summary: resolved.method.summary };
    } catch (err) {
      log.error("import of saved payment method failed", { error: err, clientId: link.clientId, customerId: link.customerId });
      return { ...base, ok: false, error: "Stripe lookup failed" };
    }
  }

  const results: LinkResult[] = [];
  for (let i = 0; i < links.length; i += APPLY_CONCURRENCY) {
    results.push(...(await Promise.all(links.slice(i, i + APPLY_CONCURRENCY).map(applyOne))));
  }

  return NextResponse.json({
    imported: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
    autopayEnabled: enableAutopay,
  });
}
