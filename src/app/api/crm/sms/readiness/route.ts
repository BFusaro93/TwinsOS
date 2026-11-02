import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { orgCanSendSms } from "@/lib/sms/send";

/** GET /api/crm/sms/readiness — can this org send text messages today? Shown by the
 *  automation text step and the Send Text dialog so a missing sender isn't a silent skip. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await getEffectiveOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 403 });
  const ready = await orgCanSendSms(supabase, orgId);
  return NextResponse.json({ ready });
}
