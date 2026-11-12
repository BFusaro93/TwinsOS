import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { orgHasPaidSmsAddon } from "@/lib/twilio/provisioning";

/**
 * Gate for every SMS-setup step that can reach Twilio (saving the business
 * info, "Continue setup"): the org must be writable (not canceled / an ended
 * trial) and have the PAID SMS add-on — see orgHasPaidSmsAddon. Returns the
 * response to send back, or null to continue.
 */
export async function requireSmsSetupAllowed(orgId: string): Promise<NextResponse | null> {
  const db = createServiceClient();
  const notWritable = await assertOrgWritable(db, orgId);
  if (notWritable) return notWritable;
  if (!(await orgHasPaidSmsAddon(db, orgId))) {
    return NextResponse.json(
      {
        error:
          "Your own texting number needs the SMS add-on. An admin can add it in Settings → Subscription (it isn't available during the free trial).",
      },
      { status: 402 }
    );
  }
  return null;
}
