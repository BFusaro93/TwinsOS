import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/resend
 *
 * Resend delivers email lifecycle events (delivered, bounced, complained,
 * etc.) via a Svix-signed webhook. This is what actually populates
 * client_activity.delivered_at — previously nothing did, so the Email
 * Activity "Delivered" stat/filter always showed 0 and was removed.
 *
 * Setup required outside this codebase (cannot be done from here):
 *   1. In the Resend dashboard, add a webhook pointed at this route's full URL.
 *   2. Copy the signing secret Resend shows you and set it as
 *      RESEND_WEBHOOK_SECRET in the environment.
 *   3. Subscribe the webhook to at least the "email.delivered" event.
 *
 * Every send call-site now stores the outbound message's Resend id as
 * client_activity.resend_message_id, which is how an incoming event here
 * gets matched back to the log row it's reporting on.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const payload = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  let event: { type: string; data: { email_id?: string; created_at?: string } };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch (err) {
    console.error("[resend webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const messageId = event.data.email_id;
  if (!messageId) {
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case "email.delivered": {
      const { error } = await supabase
        .from("client_activity")
        .update({ delivered_at: event.data.created_at ?? new Date().toISOString() })
        .eq("resend_message_id", messageId);
      if (error) console.error("[resend webhook] failed to update delivered_at:", error);
      break;
    }
    default:
      // Other event types (bounced, complained, opened, clicked, etc.) aren't
      // tracked yet — no column to write them to. Ignored, not an error.
      break;
  }

  return NextResponse.json({ received: true });
}
