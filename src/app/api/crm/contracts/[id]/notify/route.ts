import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { notifyStaffOfContractSigned } from "@/lib/contract-notify";

/**
 * POST /api/crm/contracts/[id]/notify
 *
 * Fired best-effort from useUpdateContractStatus after the DB write already
 * succeeded — mirrors the ticket-notify route's pattern.
 * Body: { event: "signed" }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: contractId } = await params;
  let body: { event?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: contract } = await adminClient
    .from("crm_contracts")
    .select("id, org_id, title, sales_rep_id")
    .eq("id", contractId)
    .single();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  if (body.event === "signed") {
    await notifyStaffOfContractSigned(adminClient, {
      orgId: contract.org_id as string,
      contractId: contract.id as string,
      contractTitle: contract.title as string,
      salesRepId: contract.sales_rep_id as string | null,
    });
  } else {
    return NextResponse.json({ error: `Unknown event: ${body.event}` }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
