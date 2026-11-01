import { buildClientMergeVars } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { proposalUrlFor } from "@/lib/estimates/share-token";
import { escapeHtml } from "@/lib/utils/escape-html";
import {
  parseColumnsContent,
  renderBlocksToHtml,
  resolveMergeTags,
  serializeColumnsContent,
  type RenderableBlock,
} from "@/lib/utils/document-template-renderer";
import type { BlockType } from "@/types/crm-documents";
import type { ProposalContent, ProposalDocument } from "@/lib/estimates/proposal-content";

// Shared by the public proposal page (server-rendered HTML) and the estimate
// PDF: turns an Estimate-type document's blocks into something each surface
// can draw, with the estimate_grid block marking where the built-in
// line-items/totals section goes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Company / client / estimate merge values for an estimate's document.
 * Values are RAW (unescaped); resolveMergeTags escapes them at substitution.
 * Money, valid-until and notes come from `content` (the version the client was
 * sent) when given, otherwise from the live estimate. Never throws; returns
 * what it could build.
 *
 * [estimategrid] is deliberately NOT set: the page/PDF place the real grid at
 * the estimate_grid block, and a stray [estimategrid] tag inside a paragraph
 * resolves blank so it can't duplicate it.
 */
export async function loadEstimateDocumentMergeVars(
  supabase: AnySupabase,
  estimateId: string,
  opts: { content?: ProposalContent | null; shareToken?: string | null; html: boolean },
): Promise<Record<string, string>> {
  try {
    const { data: est } = await supabase
      .from("estimates")
      .select(
        "org_id, estimate_number, estimate_date, created_at, valid_until_date, notes, subtotal_cents, total_cents, discount_cents, " +
        "clients(display_name, first_name, last_name, primary_email, account_number)",
      )
      .eq("id", estimateId)
      .maybeSingle();
    if (!est) return {};
    const { data: org } = await supabase
      .from("organizations")
      .select("name, brand_color, address, customizations")
      .eq("id", est.org_id)
      .maybeSingle();
    const addr = ((org?.address as Record<string, string> | null) ?? {});
    const orgName = (org?.name as string | null) ?? "Your Service Provider";
    const timeZone = await getOrgTimeZone(supabase, est.org_id as string);
    const client = est.clients as {
      display_name: string | null; first_name: string | null; last_name: string | null;
      primary_email: string | null; account_number: string | null;
    } | null;

    const dateOpts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
    const quoteDate = est.estimate_date
      ? new Date(`${est.estimate_date as string}T12:00:00`).toLocaleDateString("en-US", dateOpts)
      : new Date(est.created_at as string).toLocaleDateString("en-US", { ...dateOpts, timeZone });
    const validUntil = opts.content ? opts.content.validUntil : (est.valid_until_date as string | null);
    const subtotal = opts.content ? opts.content.subtotalCents : ((est.subtotal_cents as number) ?? 0);
    const total = opts.content ? opts.content.totalCents : ((est.total_cents as number) ?? 0);
    const discount = opts.content ? opts.content.discountCents : ((est.discount_cents as number) ?? 0);
    const notes = opts.content ? opts.content.notes : (est.notes as string | null);

    const vars: Record<string, string> = {
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
      "[estimatevaliduntil]": validUntil ? new Date(`${validUntil.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", dateOpts) : "",
      "[estimatesubtotal]": fmtCents(subtotal),
      "[estimatetotal]": fmtCents(total),
      "[estimatediscountamt]": fmtCents(discount),
      "[estimatenotes]": notes ?? "",
      "[salesrepname]": orgName,
      "[estimategrid]": "",
      "[estimatelink]": "",
      "[estimatelogo]": "",
    };
    if (opts.shareToken) vars["[estimatelinkurl]"] = proposalUrlFor(opts.shareToken);
    if (opts.html) {
      const logo = ((org?.customizations as Record<string, unknown> | null)?.logoDataUrl as string | undefined) ?? "";
      if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(logo) || /^https:\/\//i.test(logo)) {
        // Server-built, HTML-safe fragment (see HTML_SAFE_MERGE_TAG_KEYS).
        vars["[estimatelogo]"] = `<img src="${escapeHtml(logo)}" alt="" style="max-height:64px;max-width:100%;height:auto" />`;
      }
    }
    return vars;
  } catch {
    return {};
  }
}

function sortedBlocks(doc: ProposalDocument): ProposalDocument["blocks"] {
  return [...doc.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
}

function splitAtGrid<T extends { blockType: string }>(blocks: T[]): { before: T[]; after: T[]; hasGrid: boolean } {
  const idx = blocks.findIndex((b) => b.blockType === "estimate_grid");
  if (idx < 0) return { before: blocks, after: [], hasGrid: false };
  return { before: blocks.slice(0, idx), after: blocks.slice(idx + 1).filter((b) => b.blockType !== "estimate_grid"), hasGrid: true };
}

/**
 * HTML for the public proposal page: blocks before the estimate_grid block and
 * blocks after it. With no grid block everything goes in `beforeHtml` (above the
 * built-in section). Block HTML is sanitized before merge-tag substitution (see
 * RenderOptions.sanitize), so the result is safe for dangerouslySetInnerHTML.
 * Either part is "" when it has no renderable blocks.
 */
export function renderProposalDocumentHtml(
  doc: ProposalDocument,
  vars: Record<string, string>,
): { beforeHtml: string; afterHtml: string; hasGrid: boolean } {
  const toRenderable = (b: ProposalDocument["blocks"][number]): RenderableBlock => ({
    blockType: b.blockType as BlockType,
    content: b.content,
    settings: b.settings,
  });
  const { before, after, hasGrid } = splitAtGrid(sortedBlocks(doc));
  const render = (blocks: ProposalDocument["blocks"]) => {
    if (blocks.length === 0) return "";
    const html = renderBlocksToHtml(blocks.map(toRenderable), vars, { sanitize: true, fullWidth: true });
    // renderBlocksToHtml always wraps; a wrapper with nothing inside is empty.
    return (html.replace(/<[^>]+>/g, "").trim() !== "" || /<(img|hr|table)\b/i.test(html)) ? html : "";
  };
  return { beforeHtml: render(before), afterHtml: render(after), hasGrid };
}

export interface PdfDocumentBlock {
  blockType: BlockType;
  orderIndex: number;
  content: string | null;
  settings: Record<string, unknown> | null;
}

/** Blocks with merge tags resolved in their text, for the react-pdf renderer
 *  (which draws block HTML itself and does no tag substitution). */
export function resolveDocumentBlocksForPdf(doc: ProposalDocument, vars: Record<string, string>): PdfDocumentBlock[] {
  return sortedBlocks(doc).map((b) => {
    const blockType = b.blockType as BlockType;
    let content = b.content;
    if (content) {
      if (blockType === "columns") {
        const parsed = parseColumnsContent(content);
        content = serializeColumnsContent({ ...parsed, columns: parsed.columns.map((c) => resolveMergeTags(c, vars)) });
      } else if (blockType !== "image" && blockType !== "estimate_grid") {
        content = resolveMergeTags(content, vars);
      }
    }
    return { blockType, orderIndex: b.orderIndex, content, settings: b.settings };
  });
}
