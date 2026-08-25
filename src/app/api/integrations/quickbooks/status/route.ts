import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidConnection, fetchCompanyInfo, isQuickBooksConfigured } from "@/lib/integrations/quickbooks";
import { logger } from "@/lib/logger";

const log = logger.child("quickbooks-status");

/** GET /api/integrations/quickbooks/status — connection state for the Settings UI. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  if (!isQuickBooksConfigured()) {
    return NextResponse.json({ connected: false, configured: false });
  }

  try {
    const conn = await getValidConnection(supabase, profile.org_id);
    if (!conn) return NextResponse.json({ connected: false, configured: true });

    const { companyName } = await fetchCompanyInfo(conn);
    return NextResponse.json({ connected: true, configured: true, companyName });
  } catch (err) {
    log.error("failed to check QuickBooks status", { err, orgId: profile.org_id });
    return NextResponse.json({ connected: false, configured: true, error: "Connection check failed" });
  }
}
