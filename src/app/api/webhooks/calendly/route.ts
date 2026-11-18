/**
 * POST /api/webhooks/calendly
 *
 * Calendly "invitee.created" webhook. A booked demo becomes a LEAD in the platform staff org
 * (source "Demo request"), where staff can market to it, run automations and open tickets. When the
 * company later signs up, the signup flow converts that same lead instead of creating a duplicate.
 *
 * Auth: Calendly signs each delivery (header `Calendly-Webhook-Signature: t=<unix>,v1=<hmac>`),
 * HMAC-SHA256 of `${t}.${rawBody}` with the subscription's signing key (CALENDLY_WEBHOOK_SIGNING_KEY).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createDemoRequestLead } from "@/lib/staff/subscriber-clients";
import { logger } from "@/lib/logger";

const log = logger.child("calendly-webhook");

const TOLERANCE_SECONDS = 180;
const PUBLIC_MAIL = /^(gmail|yahoo|hotmail|outlook|icloud|aol|msn|live|me|proton|protonmail)\./i;

function verifySignature(header: string | null, rawBody: string, key: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", key).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Invitee = {
  email?: string;
  name?: string;
  text_reminder_number?: string | null;
  questions_and_answers?: { question?: string; answer?: string }[];
  scheduled_event?: { start_time?: string };
};

/** Company comes from a booking-form question when there is one, else the work email's domain. */
function companyFor(inv: Invitee, email: string, name: string): string {
  const qa = inv.questions_and_answers ?? [];
  const hit = qa.find((q) => /company|business|organization|organisation/i.test(q.question ?? "") && q.answer?.trim());
  if (hit?.answer) return hit.answer.trim();
  const domain = email.split("@")[1] ?? "";
  if (domain && !PUBLIC_MAIL.test(domain)) {
    const base = domain.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return name;
}

export async function POST(req: NextRequest) {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) {
    log.error("CALENDLY_WEBHOOK_SIGNING_KEY not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const rawBody = await req.text();
  if (!verifySignature(req.headers.get("calendly-webhook-signature"), rawBody, key)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { event?: string; payload?: Invitee };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Only bookings create leads; acknowledge everything else so Calendly doesn't retry.
  if (body.event !== "invitee.created" || !body.payload) return NextResponse.json({ ok: true, ignored: true });

  const inv = body.payload;
  const email = inv.email?.trim();
  const name = inv.name?.trim();
  if (!email || !name) return NextResponse.json({ ok: true, ignored: true });

  const answers = (inv.questions_and_answers ?? [])
    .filter((q) => q.question && q.answer?.trim())
    .map((q) => `${q.question}: ${q.answer!.trim()}`)
    .join("\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const result = await createDemoRequestLead(db, {
    companyName: companyFor(inv, email, name),
    contactName: name,
    email,
    phone: inv.text_reminder_number ?? null,
    message: answers || null,
    scheduledFor: inv.scheduled_event?.start_time ?? null,
  });
  if (!result) {
    // 500 makes Calendly retry; a missing staff org or bad email is permanent but harmless to retry.
    log.error("could not record calendly booking");
    return NextResponse.json({ error: "Could not record booking" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
