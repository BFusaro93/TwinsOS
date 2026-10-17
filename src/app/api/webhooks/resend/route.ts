import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServiceClient } from "@/lib/supabase/server";

// Maps a Resend event type to the client_activity column recording its
// first occurrence. Resend's event catalog (resend.com/docs/webhooks/event-types):
// sent, delivered, delivery_delayed, bounced, opened, clicked, complained,
// failed, scheduled, suppressed, received. "email.complained" (the recipient
// hit "Report spam") has no timestamp column here — it is handled separately
// below: it opts the client out of marketing instead.
// Only events with a clear, single-column "did X happen and when" meaning
// are tracked; email.sent/scheduled/delivery_delayed aren't (no column, low
// value) — an unmapped event just falls through as a no-op.
const EVENT_COLUMN: Record<string, string> = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.clicked": "clicked_at",
  "email.bounced": "bounced_at",
  "email.failed": "failed_at",
};

/**
 * POST /api/webhooks/resend
 *
 * Resend delivers email lifecycle events (delivered, opened, clicked,
 * bounced, failed, etc.) via a Svix-signed webhook. This is what actually
 * populates client_activity's engagement timestamps — previously nothing
 * did, so Email Activity's Delivered/Opened/Bounced/Failed stats all showed
 * 0/"—" and Delivered had to be removed until this existed.
 *
 * Setup required outside this codebase (cannot be done from here):
 *   1. In the Resend dashboard, add a webhook pointed at this route's full URL.
 *   2. Copy the signing secret Resend shows you and set it as
 *      RESEND_WEBHOOK_SECRET in the environment.
 *   3. Subscribe the webhook to email.delivered/opened/clicked/bounced/failed/complained.
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

  let event: { type: string; data: { email_id?: string; created_at?: string; bounce?: { type?: string } } };
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

  // A spam report. There is no activity column for it (an earlier migration
  // removed complained_at), but ignoring it left the address receiving
  // campaigns and kept hurting the sending domain's reputation. Treat it as a
  // marketing opt-out: do_not_market stops campaigns/automation marketing mail,
  // while service mail (invoices, estimates) still goes — a genuine bounce is
  // the only thing that blocks those (email_bounced_at). Needs the Resend
  // webhook to be subscribed to email.complained.
  if (event.type === "email.complained") {
    const supabase = createServiceClient();
    const { data: row, error: lookupErr } = await supabase
      .from("client_activity")
      .select("client_id, org_id")
      .eq("resend_message_id", messageId)
      .maybeSingle();
    if (lookupErr) {
      console.error("[resend webhook] complaint lookup failed:", lookupErr);
      return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
    if (row?.client_id) {
      const { data: flipped, error: optOutErr } = await supabase
        .from("clients")
        .update({ do_not_market: true })
        .eq("id", row.client_id)
        .eq("do_not_market", false)
        .select("id");
      if (optOutErr) {
        console.error("[resend webhook] failed to opt complained client out:", optOutErr);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
      }
      // Leave a timeline note once (only when this delivery actually flipped it).
      if (flipped?.length) {
        await supabase.from("client_activity").insert({
          org_id: row.org_id,
          client_id: row.client_id,
          activity_type: "note",
          subject: "Reported an email as spam — removed from marketing",
        });
      }
    }
    return NextResponse.json({ received: true });
  }

  const column = EVENT_COLUMN[event.type];
  if (!column) {
    // email.sent, email.delivery_delayed, etc. — no column to write, ignored.
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  // Only set on first occurrence — a recipient opening/clicking an email
  // multiple times shouldn't keep moving the recorded timestamp forward.
  const { data: updated, error } = await supabase
    .from("client_activity")
    // `as never`: postgrest rejects excess properties on a dynamically-built patch.
    .update({ [column]: event.data.created_at ?? new Date().toISOString() } as never)
    .eq("resend_message_id", messageId)
    .is(column, null)
    .select("client_id")
    .maybeSingle();
  if (error) {
    console.error(`[resend webhook] failed to update ${column}:`, error);
    // 5xx so Svix retries — for a bounce this is the only thing that suppresses
    // the address.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  // A bounce was logged but nothing ever stopped future sends to that address,
  // so the same dead address kept getting re-sent to indefinitely.
  //
  // This used to set do_not_market, which overloaded a MARKETING PREFERENCE
  // with a DELIVERABILITY FACT — staff saw "skipped (Do Not Market)" for
  // clients who had never opted out of anything, and there was no safe way to
  // let a service notice reach a genuine opt-out without also resurrecting
  // dead addresses. email_bounced_at keeps the two separate: every sender
  // excludes a bounced address (marketing or transactional), while
  // do_not_market now means only what its name says.
  // See 20260919010000_client_email_bounce_suppression.sql.
  // Only a hard bounce means the address is dead — a Transient one (mailbox
  // full, server down) must not permanently block every future send.
  const isSoftBounce = event.data.bounce?.type?.toLowerCase() === "transient";
  if (event.type === "email.bounced" && !isSoftBounce) {
    // Resolve the client from the message id itself, NOT from the first-write
    // update above: that one only matches while bounced_at is still null, so a
    // delivery that stamped bounced_at but died before suppressing the client
    // would make every Svix retry skip suppression forever.
    const clientId =
      updated?.client_id ??
      (
        await supabase
          .from("client_activity")
          .select("client_id")
          .eq("resend_message_id", messageId)
          .maybeSingle()
      ).data?.client_id;
    if (clientId) {
      const { error: suppressErr } = await supabase
        .from("clients")
        .update({ email_bounced_at: event.data.created_at ?? new Date().toISOString() })
        .eq("id", clientId)
        .is("email_bounced_at", null);
      if (suppressErr) {
        console.error("[resend webhook] failed to suppress bounced client:", suppressErr);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
