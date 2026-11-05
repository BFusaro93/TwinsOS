import { NextResponse } from "next/server";
import { getPortalAccounts, getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";
import { validateImageUpload } from "@/lib/utils/image-upload";
import { heicToJpeg, isHeic, HEIC_MAX_BYTES } from "@/lib/utils/convert-heic";

const log = logger.child("portal/tickets/attachments");

/** A ticket is a message, not a file share — enough for "here's the damage" shots. */
const MAX_PHOTOS_PER_TICKET = 5;

/**
 * POST /api/portal/tickets/[id]/attachments  (multipart, field "file")
 *
 * Adds one photo to a ticket the portal customer filed. Stored in the shared
 * `attachments` table with record_type 'ticket', so it appears in the staff
 * ticket's Attachments tab with no further work. Images only: SA's portal lets
 * customers attach photos so a damage report arrives with evidence.
 *
 * Written with the service client because portal users have no profiles row and
 * so can't satisfy the org-member storage/table policies; ownership is checked
 * explicitly below instead (ticket in the login's own org AND on one of its
 * accounts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkAuthRateLimit(`portal-ticket-photo:${ctx.clientId}`, 30, 600))) {
    return NextResponse.json({ error: "Too many uploads. Please wait a few minutes and try again." }, { status: 429 });
  }

  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }
  const image = validateImageUpload(file);
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: 400 });

  const service = createServiceClient();
  const accounts = await getPortalAccounts(ctx);
  const { data: ticket } = await service
    .from("crm_tickets")
    .select("id, client_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .eq("visible_to_client", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ticket || !ticket.client_id || !accounts.some((a) => a.id === ticket.client_id)) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { count } = await service
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("record_type", "ticket")
    .eq("record_id", ticket.id)
    .is("deleted_at", null);
  if ((count ?? 0) >= MAX_PHOTOS_PER_TICKET) {
    return NextResponse.json({ error: `A ticket can have up to ${MAX_PHOTOS_PER_TICKET} photos.` }, { status: 400 });
  }

  try {
    // The attachments bucket rejects image/heic, and iPhone photos arrive as
    // HEIC — convert, as the visit-photo and upsell routes do.
    const convertHeic = isHeic(file);
    if (convertHeic && file.size > HEIC_MAX_BYTES) {
      return NextResponse.json({ error: "HEIC photos must be 15MB or smaller" }, { status: 400 });
    }
    let contentType = image.contentType;
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    if (convertHeic) {
      buffer = await heicToJpeg(buffer);
      contentType = "image/jpeg";
    }
    const ext = convertHeic ? "jpg" : image.ext;
    // org_id MUST lead the path — the bucket's policies scope on the first folder.
    const storagePath = `${ctx.orgId}/portal-tickets/${ticket.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await service.storage.from("attachments").upload(storagePath, buffer, { contentType });
    if (uploadError) throw new Error(uploadError.message);

    const { data: client } = await service.from("clients").select("display_name").eq("id", ticket.client_id).maybeSingle();
    const { error: attachError } = await service.from("attachments").insert({
      org_id: ctx.orgId,
      record_type: "ticket",
      record_id: ticket.id,
      file_name: convertHeic ? file.name.replace(/\.(heic|heif)$/i, ".jpg") : file.name || `photo.${ext}`,
      file_size: buffer.length,
      file_type: contentType,
      storage_path: storagePath,
      uploaded_by_name: client?.display_name ? `${client.display_name} (portal)` : "Customer (portal)",
    });
    if (attachError) {
      await service.storage.from("attachments").remove([storagePath]);
      throw new Error(attachError.message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("portal ticket photo failed", { ticketId: ticket.id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Couldn't upload that photo. Please try again." }, { status: 500 });
  }
}
