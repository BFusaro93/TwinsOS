import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { createClient } from "@/lib/supabase/server";
import {
  getValidConnection,
  findOrCreateCustomer,
  createCustomerWithFallback,
  customerExists,
  customerMatchContextFor,
  QboDuplicateNameError,
  QboInactiveCustomerError,
} from "@/lib/integrations/quickbooks";
import { logger } from "@/lib/logger";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

/** GET /api/crm/clients/[clientId]/quickbooks-sync — current link status, for the Settings UI. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const effOrgId = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  const { clientId } = await params;
  const { data: client } = await supabase
    .from("clients")
    .select("qbo_customer_id")
    .eq("id", clientId)
    .eq("org_id", effOrgId)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  return NextResponse.json({ qboCustomerId: client.qbo_customer_id ?? null });
}

const log = logger.child("quickbooks-client-sync");

/**
 * POST /api/crm/clients/[clientId]/quickbooks-sync — links this client to a
 * QuickBooks customer. Body: {} to auto-match/create; { qboCustomerId }
 * to force-link a specific customer (used when a previous call returned
 * status "ambiguous" and the user picked one); or { forceCreate: true } to
 * skip matching entirely and create a new customer (the "none of these are
 * right" option on that same ambiguous picker).
 *
 * One QuickBooks customer belongs to one client: a customer already linked to
 * a different client is never auto-linked or force-linked. When the client's
 * plain name is taken (by that other client's customer, a vendor, an
 * employee, or an inactive customer), the new customer is created as
 * "<name> (acct #<account number>)".
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const effOrgId = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  // Also fired automatically as part of invoice sync, so accept client/invoice
  // keys as well as the explicit resync permission.
  if (!(await hasAnySettingsPermission(supabase, ["quickbooks_resync", "client_allow_edit", "client_add", "acct_send_invoices", "acct_add_modify_invoices"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const forcedCustomerId = typeof body.qboCustomerId === "string" ? body.qboCustomerId : null;
  const forceCreate = body.forceCreate === true;

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, account_number, primary_email, primary_phone, billing_address, billing_city, billing_state, billing_zip")
    .eq("id", clientId)
    .eq("org_id", effOrgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const conn = await getValidConnection(supabase, effOrgId);
  if (!conn) return NextResponse.json({ error: "QuickBooks is not connected" }, { status: 400 });

  try {
    const customerInput = {
      displayName: client.display_name,
      email: client.primary_email,
      phone: client.primary_phone,
      billingAddressLine1: client.billing_address,
      billingCity: client.billing_city,
      billingState: client.billing_state,
      billingZip: client.billing_zip,
    };

    const ctx = customerMatchContextFor(supabase, effOrgId, client);
    let customerId: string;

    if (forcedCustomerId) {
      // Confirm this id is a real customer in the org's own QBO company
      // before writing it — otherwise any org member could force-link a
      // client to an arbitrary string, only surfacing as an opaque QBO 400
      // on the next invoice push.
      if (!(await customerExists(conn, forcedCustomerId))) {
        return NextResponse.json({ error: "That QuickBooks customer could not be found" }, { status: 400 });
      }
      if (await ctx.isLinkedToOtherClient(forcedCustomerId)) {
        return NextResponse.json(
          { error: "That QuickBooks customer is already linked to another client. Pick a different one, or create a new customer." },
          { status: 409 }
        );
      }
      customerId = forcedCustomerId;
    } else if (forceCreate) {
      customerId = await createCustomerWithFallback(conn, customerInput, ctx);
    } else {
      const result = await findOrCreateCustomer(conn, customerInput, ctx);
      if (result.status === "ambiguous") {
        return NextResponse.json({ status: "ambiguous", candidates: result.candidates });
      }
      customerId = result.customerId!;
    }

    const { error } = await supabase.from("clients").update({ qbo_customer_id: customerId }).eq("id", clientId);
    if (error) throw error;

    return NextResponse.json({ status: "linked", qboCustomerId: customerId });
  } catch (err) {
    // Fixable by the user, with a message that says how.
    if (err instanceof QboDuplicateNameError || err instanceof QboInactiveCustomerError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    log.error("QuickBooks client sync failed", { err, clientId, orgId: effOrgId });
    return NextResponse.json({ error: "Failed to sync with QuickBooks" }, { status: 500 });
  }
}
