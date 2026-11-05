import { Resend } from "resend";
import { buildEstimatePDFData, renderEstimatePDF } from "@/lib/estimate-pdf";
import { buildEstimateGridHtml } from "@/lib/estimates/estimate-grid-html";
import { buildClientMergeVars, orgEmailFrom, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { replyToFromCustomizations } from "@/lib/email/reply-to";
import { addParagraphSpacing, renderBlocksToHtml, resolveMergeTags, resolveSubjectMergeTags } from "@/lib/utils/document-template-renderer";
import type { RenderableBlock } from "@/lib/utils/document-template-renderer";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { proposalUrlFor } from "@/lib/estimates/share-token";
import { getConfirmationSettings } from "@/lib/estimates/confirmation-settings";
import { findBouncedAddresses } from "@/lib/email/bounced-addresses";
import { resolveEstimateDocument } from "@/lib/estimates/resolve-estimate-document";
import { logger } from "@/lib/logger";

const log = logger.child("proposal-accept-confirmation");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Sends the org's configured "estimate accepted" confirmation document.
 *
 * Returns "sent" / "failed" when a configured, still-active document handled
 * the confirmation (the caller must NOT also send the built-in email), or
 * "not_configured" when the caller should fall back to the built-in email.
 * Never throws: a failure here must not fail the acceptance.
 */
export async function sendConfiguredAcceptanceConfirmation(
  supabase: AnySupabase,
  args: { estimateId: string; shareToken: string },
): Promise<"sent" | "failed" | "not_configured"> {
  try {
    const { data: est } = await supabase
      .from("estimates")
      .select(
        "org_id, client_id, estimate_number, estimate_date, created_at, valid_until_date, notes, subtotal_cents, total_cents, " +
        "clients(display_name, first_name, last_name, primary_email, billing_email, account_number)",
      )
      .eq("id", args.estimateId)
      .single();
    if (!est) return "not_configured";

    const { data: org } = await supabase
      .from("organizations")
      .select("name, brand_color, address, customizations")
      .eq("id", est.org_id)
      .single();
    if (!org) return "not_configured";

    // The estimate document's own Confirmation Email settings win; otherwise
    // fall back to the org-level "Accepted Email" settings.
    const estimateDoc = await resolveEstimateDocument(supabase, args.estimateId);
    const orgSettings = getConfirmationSettings(org.customizations);
    let settings = estimateDoc?.confirmation_document_id
      ? {
          documentId: estimateDoc.confirmation_document_id,
          recipient: estimateDoc.confirmation_recipient,
          includeEstimatePdf: estimateDoc.confirmation_include_estimate_pdf,
        }
      : orgSettings;
    if (!settings.documentId) return "not_configured";

    // The document must still exist, be active, and be an email-capable type.
    const loadDoc = async (id: string) => {
      const { data } = await supabase
        .from("crm_document_templates")
        .select("id, subject, doc_type, status")
        .eq("id", id)
        .eq("org_id", est.org_id)
        .is("deleted_at", null)
        .maybeSingle();
      return data && data.status === "active" && ["client", "estimate"].includes(data.doc_type) ? data : null;
    };
    let doc = await loadDoc(settings.documentId);
    if (!doc && estimateDoc?.confirmation_document_id) {
      // The estimate document points at a confirmation email that was deleted or deactivated:
      // fall back to the org-level Accepted Email before the built-in one, and say so in the log.
      log.warn("estimate document's confirmation email is deleted or inactive; using the org default", {
        estimateId: args.estimateId,
        documentId: settings.documentId,
      });
      if (orgSettings.documentId) {
        settings = orgSettings;
        doc = await loadDoc(orgSettings.documentId);
      }
    }
    if (!doc) return "not_configured";

    const { data: blocks } = await supabase
      .from("crm_document_blocks")
      .select("block_type, content, settings, order_index")
      .eq("template_id", doc.id)
      .order("order_index", { ascending: true });

    const client = est.clients as {
      display_name: string | null; first_name: string | null; last_name: string | null;
      primary_email: string | null; billing_email: string | null;
      account_number: string | null;
    } | null;

    // billing_email is the default, falling back to the primary address.
    const recipient = settings.recipient === "billing_email"
      ? (client?.billing_email?.trim() || client?.primary_email?.trim() || null)
      : (client?.primary_email?.trim() || null);
    // A hard-bounced address is dead; it blocks every send. Checked for the
    // address actually used (billing or primary) — bounces are per address
    // (20261220000500_email_address_bounces.sql). do_not_market is a marketing
    // preference only and is deliberately ignored for this transactional email.
    if (!recipient) return "failed";
    try {
      if ((await findBouncedAddresses(est.org_id as string, [recipient])).size > 0) return "failed";
    } catch {
      return "failed";
    }

    const addr = (org.address as Record<string, string>) ?? {};
    const orgName = (org.name as string | null) ?? "Your Service Provider";
    const brandColor = (org.brand_color as string | null) ?? "#60ab45";
    const timeZone = await getOrgTimeZone(supabase, est.org_id as string);

    const proposalUrl = proposalUrlFor(args.shareToken);
    const linkButton =
      `<a href="${proposalUrl}" style="color:#fff;background:${brandColor};padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">View Your Proposal →</a>`;
    const dateOpts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
    const quoteDate = est.estimate_date
      ? new Date(`${est.estimate_date as string}T12:00:00`).toLocaleDateString("en-US", dateOpts)
      : new Date(est.created_at as string).toLocaleDateString("en-US", { ...dateOpts, timeZone });

    // Same table the Send Estimate email prints; "" when there are no lines, so
    // the renderer drops a grid-only paragraph rather than leaving a gap.
    const pdfData = await buildEstimatePDFData(supabase, args.estimateId, est.org_id as string).catch(() => null);
    const gridHtml = buildEstimateGridHtml(pdfData?.estimate.lineItems ?? [], pdfData?.estimate.displaySettings);

    const mergeVars: Record<string, string> = {
      ...buildClientMergeVars(
        {
          displayName: client?.display_name ?? null,
          firstName: client?.first_name ?? null,
          lastName: client?.last_name ?? null,
          primaryEmail: client?.primary_email ?? null,
          accountNumber: client?.account_number ?? null,
        },
        {
          name: orgName,
          addressPhone: addr.phone, addressStreet: addr.street, addressCity: addr.city,
          addressState: addr.state, addressZip: addr.zip, timeZone,
        },
        { escape: false },
      ),
      "[estimatenumber]": String(est.estimate_number).padStart(5, "0"),
      "[estimatedate]": quoteDate,
      "[estimatevaliduntil]": est.valid_until_date
        ? new Date(`${est.valid_until_date as string}T12:00:00`).toLocaleDateString("en-US", dateOpts)
        : "",
      "[estimatesubtotal]": fmtCents((est.subtotal_cents as number) ?? 0),
      "[estimatetotal]": fmtCents((est.total_cents as number) ?? 0),
      "[estimatenotes]": (est.notes as string | null) ?? "",
      "[estimatelink]": linkButton,
      "[estimatelinkurl]": proposalUrl,
      "[estimategrid]": gridHtml,
      "[salesrepname]": orgName,
    };

    const renderable: RenderableBlock[] = (blocks ?? []).map((b: Record<string, unknown>) => ({
      blockType: b.block_type as RenderableBlock["blockType"],
      content: (b.content as string | null) ?? null,
      settings: (b.settings as Record<string, unknown> | null) ?? null,
    }));
    const html = addParagraphSpacing(resolveMergeTags(renderBlocksToHtml(renderable, mergeVars), mergeVars));
    const subject = resolveSubjectMergeTags(
      (doc.subject as string | null) || `Your estimate #${mergeVars["[estimatenumber]"]} was accepted`,
      mergeVars,
    ) || `Your estimate was accepted — ${orgName}`;

    let attachments: { filename: string; content: string }[] | undefined;
    if (settings.includeEstimatePdf) {
      // Non-fatal: the email still goes out without the attachment.
      const buffer = await renderEstimatePDF(supabase, args.estimateId, est.org_id as string).catch(() => null);
      if (buffer) {
        attachments = [{ filename: `estimate-${est.estimate_number}.pdf`, content: buffer.toString("base64") }];
      }
    }

    const replyTo = replyToFromCustomizations(org.customizations);
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data: sent, error: sendErr } = await sendEmailRetryingRateLimit(resend, {
      from: orgEmailFrom(orgName),
      to: recipient,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments ? { attachments } : {}),
    });
    if (sendErr) {
      log.error("configured confirmation send failed", { estimateId: args.estimateId, message: sendErr.message });
      return "failed";
    }

    await supabase.from("estimate_emails").insert({
      org_id: est.org_id,
      estimate_id: args.estimateId,
      to_email: recipient,
      to_name: client?.display_name ?? null,
      subject,
      body_html: html,
      resend_id: sent?.id ?? null,
      email_type: "confirmation",
    });
    return "sent";
  } catch (err) {
    log.error("configured confirmation error", {
      estimateId: args.estimateId,
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
