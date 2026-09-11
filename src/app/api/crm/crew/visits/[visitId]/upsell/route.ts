import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { notifyStaffOfNewTicket } from "@/lib/ticket-notify";
import { logger } from "@/lib/logger";

/** Categorises the ticket so the office can filter for these, and so ticket
 *  automations (which match on category) can fire on them. */
const UPSELL_CATEGORY = "Upsell";

/** Same charset guard the crew photo route uses — both end up in a storage
 *  path inside the shared "attachments" bucket. */
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9_-]{1,100}$/;

/**
 * POST /api/crm/crew/visits/[visitId]/upsell
 *
 * A crew flags work they've spotted at a property. Everything happens
 * server-side in one call so the crew app sends one request and cannot set
 * anything it shouldn't: no price (crews never quote — see the crew_hide_pricing
 * setting), no assignee, no status, and only a service the office has opened up
 * via crm_services.show_in_field_upsells.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  // Accepts the web session or the crew-app bearer token, same as the photo
  // route the crew app already depends on.
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, org_id, job_id, client_id, crew_id, scheduled_date, crm_jobs(job_number, service_address, service_city)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  const formData = await request.formData();
  const serviceId = formData.get("serviceId") as string | null;
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!serviceId) {
    return NextResponse.json({ error: "Pick a service to suggest" }, { status: 400 });
  }

  // The curated list is the authorization boundary: a crew may only suggest a
  // service the office has opened up, never an arbitrary catalog entry.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: service } = await (supabase as any)
    .from("crm_services")
    .select("id, name, show_in_field_upsells")
    .eq("id", serviceId)
    .eq("org_id", visit.org_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!service?.show_in_field_upsells) {
    return NextResponse.json(
      { error: "That service isn't available to suggest from the field." },
      { status: 422 }
    );
  }

  // Who spotted it — used for the body line and, later, per-crew conversion
  // reporting off created_by.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();
  const spotter = profile?.name || profile?.email || "A crew member";

  const job = visit.crm_jobs as { job_number: number; service_address: string | null; service_city: string | null } | null;
  const where = [job?.service_address, job?.service_city].filter(Boolean).join(", ");

  // Context the office would otherwise have to chase: who saw it, where, and
  // when. Kept in the body rather than new columns — this is a ticket like any
  // other once it lands.
  const contextLines = [
    note,
    "",
    `Spotted by ${spotter} on ${visit.scheduled_date ?? "an unscheduled visit"}${where ? ` at ${where}` : ""}.`,
    `Suggested service: ${service.name}.`,
  ]
    .filter((l, i, arr) => !(l === "" && (i === 0 || arr[i - 1] === "")))
    .join("\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticket, error: ticketError } = await (supabase as any)
    .from("crm_tickets")
    .insert({
      org_id: visit.org_id,
      created_by: user.id,
      // 'note' is the channel this arrived by; the fact it's an upsell lives in
      // category, which is free text and needs no CHECK-constraint change.
      type: "note",
      category: UPSELL_CATEGORY,
      status: "open",
      priority: "normal",
      client_id: visit.client_id,
      subject: `Upsell: ${service.name}`,
      body: contextLines,
    })
    .select("id, ticket_number, subject, org_id")
    .single();

  if (ticketError) {
    logger.error("[crew/upsell] ticket insert failed", { error: ticketError.message });
    return NextResponse.json({ error: "Couldn't save the suggestion" }, { status: 500 });
  }

  // ── photo ──────────────────────────────────────────────────────────────────
  // A photo is most of the value here — the office can price from it without a
  // second trip out. Non-fatal: a failed upload must not lose the suggestion.
  let photoAttached = false;
  if (file && file.size > 0) {
    try {
      const rawExt = file.name.split(".").pop() ?? "jpg";
      const ext = SAFE_PATH_SEGMENT.test(rawExt) ? rawExt : "jpg";
      // org_id MUST be the first path segment: the storage policy
      // org_members_upload_attachments checks
      // storage.foldername(name)[1] = the caller's org_id, so a path led by a
      // literal like "upsells/" is rejected outright.
      const storagePath = `${visit.org_id}/upsells/${ticket.id}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uploadError } = await (supabase as any).storage
        .from("attachments")
        .upload(storagePath, buffer, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      // record_type 'ticket' is already allowed, so AttachmentsSection on the
      // ticket detail sheet renders this with no further work.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: attachError } = await (supabase as any).from("attachments").insert({
        org_id: visit.org_id,
        created_by: user.id,
        record_type: "ticket",
        record_id: ticket.id,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: storagePath,
        uploaded_by_name: spotter,
      });
      if (attachError) throw new Error(attachError.message);
      photoAttached = true;
    } catch (err) {
      logger.error("[crew/upsell] photo failed, suggestion kept", {
        ticketId: ticket.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── link back to the job it came off ──────────────────────────────────────
  // crm_ticket_links has no 'visit' type; the job is the durable thing anyway,
  // and the visit date is in the body.
  if (visit.job_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: linkError } = await (supabase as any).from("crm_ticket_links").insert({
      org_id: visit.org_id,
      ticket_id: ticket.id,
      link_type: "job",
      linked_id: visit.job_id,
      linked_label: job?.job_number ? `Job #${job.job_number}` : "Job",
      created_by: user.id,
    });
    if (linkError) {
      logger.error("[crew/upsell] job link failed, suggestion kept", {
        ticketId: ticket.id,
        error: linkError.message,
      });
    }
  }

  // Mirrors useCreateTicket so an upsell shows on the client timeline like any
  // other ticket.
  if (visit.client_id) {
    // org_id is set explicitly rather than leaning on the my_org_id() column
    // default — the default only resolves when auth.uid() does, and this route
    // also serves the crew app's bearer-token path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: activityError } = await (supabase as any).from("client_activity").insert({
      org_id: visit.org_id,
      client_id: visit.client_id,
      activity_type: "ticket",
      subject: ticket.subject,
      body: contextLines,
      status: "open",
      ref_id: ticket.id,
      ref_table: "crm_tickets",
    });
    if (activityError) {
      logger.error("[crew/upsell] client activity insert failed, suggestion kept", {
        ticketId: ticket.id,
        error: activityError.message,
      });
    }
  }

  // Called directly rather than via the notify route's HTTP hop — this is
  // already server-side. notifyStaffOfNewTicket excludes the creator, so the
  // crew member isn't notified about their own suggestion.
  try {
    await notifyStaffOfNewTicket(supabase, {
      orgId: visit.org_id,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      assignedToId: null,
      assignedToName: null,
      createdByUserId: user.id,
    });
  } catch (err) {
    logger.error("[crew/upsell] notify failed, suggestion kept", {
      ticketId: ticket.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json(
    { id: ticket.id, ticketNumber: ticket.ticket_number, photoAttached },
    { status: 201 }
  );
}
