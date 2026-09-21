import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveSmsStepContent } from "@/lib/automations/sequence-sms";
import { sendClientSms } from "@/lib/sms/send";

/**
 * 1:1 text message to a client, typed by a person (the job screen's
 * More → Send Text) rather than fired by an automation.
 *
 * Until this route, every SMS the platform sent came from an automation or
 * sequence, so consent was only ever checked on paths the org had configured
 * in advance. A free-text "text this client now" button is the case the
 * A2P 10DLC campaign registration and TCPA both care about most, so the
 * checks are all made HERE, server-side, and none of them are inferable from
 * the request body:
 *
 *   • sms_send permission (has_settings_permission — admins bypass)
 *   • the client belongs to the caller's org (the user-scoped client, so RLS
 *     applies on top of the explicit org_id filter)
 *   • a phone number is on file
 *   • sms_opt_in is true — re-checked inside sendClientSms as a backstop
 *
 * Merge-tag resolution is shared with the automation sender, so the same
 * [clientfirstname]/[companyname] tags work and an unknown tag degrades to
 * blank instead of shipping literal "[tag]" text to a customer's phone.
 */

/** Twilio's hard ceiling per message; longer bodies are rejected outright. */
const MAX_SMS_LENGTH = 1600;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "sms_send",
  });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clientId } = await params;
  const payload = await req.json() as { body?: string };
  const messageBody = payload.body?.trim() ?? "";
  if (!messageBody) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (messageBody.length > MAX_SMS_LENGTH) {
    return NextResponse.json(
      { error: `Message is too long (${messageBody.length}/${MAX_SMS_LENGTH} characters)` },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (supabase as any)
    .from("clients")
    .select("id, display_name, primary_phone, sms_opt_in")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.primary_phone) {
    return NextResponse.json({ error: "Client has no phone number on file" }, { status: 422 });
  }
  if (!client.sms_opt_in) {
    return NextResponse.json(
      { error: "Client has not opted in to text messages" },
      { status: 422 }
    );
  }

  // Service role only AFTER the caller's org ownership and permission are
  // established above — the send path writes organization_sms_usage, which
  // has no insert policy for ordinary authenticated users.
  const service = createServiceClient();

  const resolved = await resolveSmsStepContent(service, {
    orgId: profile.org_id,
    clientId,
    bodyTemplate: messageBody,
  });
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 422 });
  }

  const sent = await sendClientSms(service, {
    orgId: profile.org_id,
    clientId,
    toPhone: resolved.toPhone,
    body: resolved.bodyText,
    createdBy: user.id,
  });
  if (!sent.ok) {
    return NextResponse.json({ error: sent.reason }, { status: 502 });
  }

  return NextResponse.json({ success: true, sid: sent.sid, sentTo: resolved.toPhone });
}
