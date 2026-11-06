import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { logger } from "@/lib/logger";
import { orgEmailFrom, escapeHtml, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { Resend } from "resend";

const log = logger.child("crm/tickets/messages");

const PostBody = z.object({ body: z.string().trim().min(1).max(5000) });

/* The crm_ticket_messages table isn't in the generated Supabase types yet. */
/* eslint-disable @typescript-eslint/no-explicit-any */

async function authorize(ticketId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { data: profile } = await supabase.from("profiles").select("org_id, name").eq("id", user.id).single();
  if (!profile) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const orgId = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  const { data: canTickets } = await (supabase as any).rpc("has_settings_permission", { p_key: "tickets_view_modify" });
  if (!canTickets) return { error: NextResponse.json({ error: "You don't have permission to work tickets" }, { status: 403 }) } as const;

  // RLS scopes the read to the caller's org (and honours impersonation).
  const { data: ticket } = await supabase
    .from("crm_tickets")
    .select("id, client_id, ticket_number, subject, status, visible_to_client")
    .eq("id", ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ticket) return { error: NextResponse.json({ error: "Ticket not found" }, { status: 404 }) } as const;
  return { supabase, user, profile, orgId, ticket } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const { data, error } = await (auth.supabase as any)
    .from("crm_ticket_messages")
    .select("id, author_type, author_name, body, created_at")
    .eq("ticket_id", auth.ticket.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    ((data ?? []) as any[]).map((r) => ({ id: r.id, authorType: r.author_type, authorName: r.author_name, body: r.body, createdAt: r.created_at }))
  );
}

/**
 * POST — a staff reply to the client, shown in the portal thread. The client is
 * told by email (a service notice, like the ticket Emails tab: it ignores the
 * marketing opt-out but never goes to an address that has hard-bounced).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const { supabase, user, profile, orgId, ticket } = auth;

  if (!ticket.client_id) return NextResponse.json({ error: "Link a client to this ticket first." }, { status: 400 });
  if (!ticket.visible_to_client) {
    return NextResponse.json({ error: "Turn on “Show in client portal” for this ticket so the client can see your reply." }, { status: 400 });
  }
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });

  const { data: inserted, error } = await (supabase as any)
    .from("crm_ticket_messages")
    .insert({
      org_id: orgId,
      ticket_id: ticket.id,
      author_type: "staff",
      author_name: profile.name || "Our team",
      author_user_id: user.id,
      body: parsed.data.body,
    })
    .select("id, author_type, author_name, body, created_at")
    .single();
  if (error || !inserted) {
    log.error("failed to save staff ticket message", { ticketId: ticket.id, error: error?.message });
    return NextResponse.json({ error: "Couldn't send your reply" }, { status: 500 });
  }

  // Best-effort email to the client — the reply is already in their portal.
  let emailed = false;
  try {
    const service = createServiceClient();
    const [{ data: client }, { data: org }] = await Promise.all([
      service.from("clients").select("display_name, primary_email, email_bounced_at").eq("id", ticket.client_id).maybeSingle(),
      service.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    ]);
    if (client?.primary_email && !client.email_bounced_at && process.env.RESEND_API_KEY) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
      const label = ticket.subject ? `#${ticket.ticket_number} — ${ticket.subject}` : `#${ticket.ticket_number}`;
      await sendEmailRetryingRateLimit(new Resend(process.env.RESEND_API_KEY), {
        from: orgEmailFrom(org?.name),
        to: client.primary_email,
        subject: `New reply on your request ${label}`.replace(/\s+/g, " ").trim(),
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">You have a new reply</h2>
          <p style="margin:0 0 12px;color:#475569">${escapeHtml(org?.name ?? "Your service provider")} replied to <strong>${escapeHtml(label)}</strong>:</p>
          <blockquote style="margin:0 0 20px;padding:12px 16px;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:4px;color:#374151;white-space:pre-wrap">${escapeHtml(parsed.data.body)}</blockquote>
          <a href="${siteUrl}/portal/tickets" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View and reply</a>
        </div>`,
      });
      emailed = true;
    }
  } catch (err) {
    log.error("ticket reply email failed", { ticketId: ticket.id, error: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({
    emailed,
    message: { id: inserted.id, authorType: inserted.author_type, authorName: inserted.author_name, body: inserted.body, createdAt: inserted.created_at },
  });
}
