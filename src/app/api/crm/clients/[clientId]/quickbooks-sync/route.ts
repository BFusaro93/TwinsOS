import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidConnection, findOrCreateCustomer, createCustomer, customerExists } from "@/lib/integrations/quickbooks";
import { logger } from "@/lib/logger";

/** GET /api/crm/clients/[clientId]/quickbooks-sync — current link status, for the Settings UI. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const { data: client } = await supabase
    .from("clients")
    .select("qbo_customer_id")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
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
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const forcedCustomerId = typeof body.qboCustomerId === "string" ? body.qboCustomerId : null;
  const forceCreate = body.forceCreate === true;

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, primary_email, primary_phone, billing_address, billing_city, billing_state, billing_zip")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const conn = await getValidConnection(supabase, profile.org_id);
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

    let customerId: string;

    if (forcedCustomerId) {
      // Confirm this id is a real customer in the org's own QBO company
      // before writing it — otherwise any org member could force-link a
      // client to an arbitrary string, only surfacing as an opaque QBO 400
      // on the next invoice push.
      if (!(await customerExists(conn, forcedCustomerId))) {
        return NextResponse.json({ error: "That QuickBooks customer could not be found" }, { status: 400 });
      }
      customerId = forcedCustomerId;
    } else if (forceCreate) {
      customerId = await createCustomer(conn, customerInput);
    } else {
      const result = await findOrCreateCustomer(conn, customerInput);
      if (result.status === "ambiguous") {
        return NextResponse.json({ status: "ambiguous", candidates: result.candidates });
      }
      customerId = result.customerId!;
    }

    const { error } = await supabase.from("clients").update({ qbo_customer_id: customerId }).eq("id", clientId);
    if (error) throw error;

    return NextResponse.json({ status: "linked", qboCustomerId: customerId });
  } catch (err) {
    log.error("QuickBooks client sync failed", { err, clientId, orgId: profile.org_id });
    return NextResponse.json({ error: "Failed to sync with QuickBooks" }, { status: 500 });
  }
}
