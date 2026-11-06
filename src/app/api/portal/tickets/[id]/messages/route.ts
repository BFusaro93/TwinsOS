import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalAccounts, getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { notifyTicketComment } from "@/lib/ticket-notify";
import { logger } from "@/lib/logger";
import { MAX_REPLY_PHOTOS, photosForMessage, signPhotoPaths, storeReplyPhotos } from "@/lib/ticket-message-photos";

const log = logger.child("portal/tickets/messages");

const MAX_MESSAGE_CHARS = 2000;
const PostBody = z.object({ body: z.string().trim().max(MAX_MESSAGE_CHARS) });

/* The crm_ticket_messages table isn't in the generated Supabase types yet. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Loads the ticket only if it is one this portal login may see: same org, on
 * one of the login's own accounts, live, and shared with the client. The thread
 * table has no portal RLS policy on purpose — this check IS the access control.
 */
async function loadOwnTicket(ticketId: string) {
  const ctx = await getPortalContext();
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const service = createServiceClient();
  const accounts = await getPortalAccounts(ctx);
  const { data: ticket } = await service
    .from("crm_tickets")
    .select("id, client_id, ticket_number, subject, status, assigned_to_id, assigned_to")
    .eq("id", ticketId)
    .eq("org_id", ctx.orgId)
    .eq("visible_to_client", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ticket || !ticket.client_id || !accounts.some((a) => a.id === ticket.client_id)) {
    return { error: NextResponse.json({ error: "Ticket not found" }, { status: 404 }) } as const;
  }
  return { ctx, service, ticket } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await loadOwnTicket(id);
  if ("error" in found) return found.error;
  const { ctx, service, ticket } = found;

  const { data: rows, error } = await (service as any)
    .from("crm_ticket_messages")
    .select("id, author_type, author_name, body, photo_paths, created_at")
    .eq("ticket_id", ticket.id)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    log.error("failed to load ticket messages", { ticketId: ticket.id, error: error.message });
    return NextResponse.json({ error: "Couldn't load the conversation" }, { status: 500 });
  }
  const signed = await signPhotoPaths(service, ((rows ?? []) as any[]).flatMap((r) => r.photo_paths ?? []));
  return NextResponse.json({
    status: ticket.status,
    messages: ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      authorType: r.author_type,
      authorName: r.author_name,
      body: r.body,
      photos: photosForMessage(r.photo_paths, signed),
      createdAt: r.created_at,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await loadOwnTicket(id);
  if ("error" in found) return found.error;
  const { ctx, service, ticket } = found;

  // Each reply notifies staff: cap per portal client.
  if (!(await checkAuthRateLimit(`portal-ticket-reply:${ctx.clientId}`, 20, 600))) {
    return NextResponse.json({ error: "Too many messages. Please wait a few minutes and try again." }, { status: 429 });
  }

  // Multipart: `body` (text) and up to MAX_REPLY_PHOTOS `files`.
  const form = await req.formData().catch(() => null);
  const parsed = PostBody.safeParse({ body: typeof form?.get("body") === "string" ? form!.get("body") : "" });
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!parsed.success) {
    return NextResponse.json({ error: `Messages can be up to ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
  }
  if (!parsed.data.body && files.length === 0) {
    return NextResponse.json({ error: "Write a message or add a photo." }, { status: 400 });
  }
  if (files.length > MAX_REPLY_PHOTOS) {
    return NextResponse.json({ error: `You can attach up to ${MAX_REPLY_PHOTOS} photos.` }, { status: 400 });
  }

  const { data: client } = await service.from("clients").select("display_name").eq("id", ticket.client_id!).maybeSingle();
  const authorName = client?.display_name ?? "Customer";

  let photoPaths: string[] = [];
  if (files.length > 0) {
    const stored = await storeReplyPhotos(service, {
      orgId: ctx.orgId,
      ticketId: ticket.id,
      files,
      uploadedByName: `${authorName} (portal)`,
    });
    if ("error" in stored) return NextResponse.json({ error: stored.error }, { status: 400 });
    photoPaths = stored.paths;
  }

  const { data: inserted, error } = await (service as any)
    .from("crm_ticket_messages")
    .insert({
      org_id: ctx.orgId,
      ticket_id: ticket.id,
      author_type: "client",
      author_name: authorName,
      body: parsed.data.body,
      photo_paths: photoPaths,
    })
    .select("id, author_type, author_name, body, photo_paths, created_at")
    .single();
  if (error || !inserted) {
    log.error("failed to save ticket message", { ticketId: ticket.id, error: error?.message });
    return NextResponse.json({ error: "Couldn't send your message" }, { status: 500 });
  }

  // A reply to a closed ticket reopens it, so it comes back to the office's
  // open list instead of sitting unseen.
  if (ticket.status === "closed") {
    const { error: reopenError } = await service
      .from("crm_tickets")
      .update({ status: "open", closed_at: null })
      .eq("id", ticket.id)
      .eq("org_id", ctx.orgId);
    if (reopenError) log.error("failed to reopen ticket on reply", { ticketId: ticket.id, error: reopenError.message });
  }

  // Tell the assignee/contributors (or the new-ticket audience when nobody is
  // reachable). Best-effort: the message is already saved.
  try {
    await notifyTicketComment(service, {
      orgId: ctx.orgId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      assignedToId: ticket.assigned_to_id,
      assignedToName: ticket.assigned_to,
      commenterName: authorName,
      commenterId: null,
      commentBody: parsed.data.body || (photoPaths.length === 1 ? "(sent a photo)" : `(sent ${photoPaths.length} photos)`),
    });
  } catch (err) {
    log.error("ticket reply notification failed", { ticketId: ticket.id, error: err instanceof Error ? err.message : String(err) });
  }

  const signed = await signPhotoPaths(service, photoPaths);
  return NextResponse.json({
    reopened: ticket.status === "closed",
    message: {
      id: inserted.id,
      authorType: inserted.author_type,
      authorName: inserted.author_name,
      body: inserted.body,
      photos: photosForMessage(inserted.photo_paths, signed),
      createdAt: inserted.created_at,
    },
  });
}
