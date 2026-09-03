import type { BlockType } from "@/types/crm-documents";
import { escapeHtml } from "@/lib/email/send";

// ── Merge tag resolution ─────────────────────────────────────────────────────
// Matches the pattern used by the estimate/invoice send routes so preview and
// test-send output matches what a real send would produce.

// Tags whose value is always a trusted, pre-built HTML fragment constructed
// server-side (a link/button anchor, a logo <img>, the signature block's
// <br>-joined lines, or a future rendered line-items grid) — never raw
// freeform client/org data. These must NOT be HTML-escaped or the markup
// renders as literal text instead of a link/button. Every other merge tag
// (name, email, phone, address, notes, etc.) can end up holding real
// client/org-controlled text once a "send to real client" flow exists, so
// those get escaped at the substitution point below, matching how
// buildClientMergeVars() in lib/email/send.ts escapes freeform values before
// they reach outbound HTML.
const HTML_SAFE_MERGE_TAG_KEYS = new Set([
  "[invoicelogo]",
  "[estimatelogo]",
  "[signatureline]",
  "[formlink]",
  "[optinlink]",
  "[optoutlink]",
  "[clientportallink]",
  "[clientportalsignup]",
  "[estimatelink]",
  "[estimategrid]",
  "[paymentlink]",
  "[invoicegrid]",
]);

export function resolveMergeTags(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\[(\w+)\]/g, (match) => {
    const key = match.toLowerCase();
    if (key in vars) {
      return HTML_SAFE_MERGE_TAG_KEYS.has(key) ? vars[key] : escapeHtml(vars[key]);
    }
    // A recognized Documents merge-tag name this call just didn't provide a
    // value for (e.g. a send path that only resolves a handful of tags, fed
    // a template built with the full picker) — degrade to blank so it never
    // ships to a real recipient as literal "[tag]" syntax. Anything NOT a
    // known tag name is left alone — most likely genuine bracket text the
    // author typed (e.g. "[12 months]"), not an unresolved placeholder.
    return KNOWN_MERGE_TAG_KEYS.has(key) ? "" : match;
  });
}

// Sample values used for preview + test emails, where no real client/estimate
// record is attached yet. Keyed to match the tags defined in crm-documents.ts.
export const SAMPLE_MERGE_VALUES: Record<string, string> = {
  // Client
  "[clientname]": "Jane Homeowner",
  "[clientfirstname]": "Jane",
  "[clientlastname]": "Homeowner",
  "[contacttitle]": "Property Owner",
  "[clientemail]": "jane.homeowner@example.com",
  "[clienthomephone]": "(555) 123-4567",
  "[clientworkphone]": "(555) 123-4568",
  "[clientcellphone]": "(555) 123-4569",
  "[clientotherphone]": "(555) 123-4570",
  "[clientfax]": "(555) 123-4571",
  "[nameoninvoice]": "Jane Homeowner",
  "[accountnumber]": "10042",
  "[clientaccountbalance]": "$0.00",
  "[howwebillyou]": "Email",
  "[salesperson]": "Alex Rep",
  "[csr]": "Sam Support",
  "[referringclient]": "N/A",
  "[creditcardending]": "4242",
  "[creditcardexpiration]": "12/28",
  // Billing address
  "[billingaddress1]": "123 Main St",
  "[billingaddress2]": "",
  "[billingcity]": "Anytown",
  "[billingstate]": "MN",
  "[billingzip]": "55401",
  // Property
  "[propertyname]": "Main Residence",
  "[masterproperty]": "Main Residence",
  "[subproperty]": "",
  "[physicaladdress1]": "123 Main St",
  "[physicaladdress2]": "",
  "[physicalcity]": "Anytown",
  "[physicalstate]": "MN",
  "[physicalzip]": "55401",
  "[turfsqft]": "8,500",
  "[grosssqft]": "12,000",
  "[mulchbedsqft]": "600",
  "[yardsofmulch]": "12",
  "[parkinglot sqft]": "0",
  "[linearfeetperimeter]": "420",
  "[linearfeetedging]": "310",
  "[condounits]": "1",
  "[gatecode]": "#1234",
  "[notestocrew]": "Dog in backyard — keep gate closed.",
  // Company
  "[companyname]": "Twins Lawn Service",
  "[companyaddress]": "456 Business Ave",
  "[companycity]": "Anytown",
  "[companystate]": "MN",
  "[companyzip]": "55401",
  "[companyphone]": "(555) 987-6543",
  "[companyemail]": "info@twinslawnservice.com",
  "[companywebsite]": "www.twinslawnservice.com",
  "[invoicelogo]": "",
  "[estimatelogo]": "",
  "[signatureline]": "Twins Lawn Service<br>(555) 987-6543<br>info@twinslawnservice.com",
  // System
  "[today]": new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  "[formurl]": "https://example.com/form",
  "[formlink]": '<a href="#">Fill Out Form</a>',
  "[optinlink]": '<a href="#">Opt In</a>',
  "[optoutlink]": '<a href="#">Unsubscribe</a>',
  "[clientportallink]": '<a href="#">Client Portal</a>',
  "[clientportalsignup]": '<a href="#">Set Up Your Portal Account</a>',
  // Estimate
  "[estimatenumber]": "00042",
  "[estimatecode]": "EST-00042",
  "[estimatedate]": new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  "[estimatevaliduntil]": "30 days from send",
  "[estimatesubtotal]": "$1,250.00",
  "[estimatetotal]": "$1,325.00",
  "[estimatetotallessdiscounts]": "$1,325.00",
  "[estimatediscountpct]": "0%",
  "[estimatediscountamt]": "$0.00",
  "[estimatenotes]": "Sample estimate notes go here.",
  "[estimatelink]": '<a href="#" style="color:#fff;background:#60ab45;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">View Your Proposal &rarr;</a>',
  "[estimatelinkurl]": "https://example.com/proposal/sample",
  "[installmentcount]": "1",
  "[installmentamount]": "$1,325.00",
  "[estimategrid]": "",
  // Invoice
  "[invoicenumber]": "00042",
  "[invoicedate]": new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  "[invoiceduedate]": "Net 30",
  "[invoicesubtotal]": "$1,250.00",
  "[invoicetax]": "$75.00",
  "[invoicetotal]": "$1,325.00",
  "[invoicebalance]": "$1,325.00",
  "[paymentlink]": '<a href="#" style="color:#fff;background:#60ab45;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">Pay Now</a>',
  "[invoicegrid]": "",
};

export const KNOWN_MERGE_TAG_KEYS = new Set(Object.keys(SAMPLE_MERGE_VALUES));

// ── Block → HTML rendering (shared by preview + send-test-email) ────────────

interface RenderableBlock {
  blockType: BlockType;
  content: string | null;
}

function wrap(inner: string, style: string): string {
  return `<div style="${style}">${inner}</div>`;
}

// The Tiptap editor gives <p> tags spacing via a `.ProseMirror p` CSS rule
// scoped to the editor itself. That rule doesn't exist in preview/email/PDF
// output, so multi-paragraph rich-text content (built with Enter presses
// inside a single block) renders with no gap between paragraphs unless we
// inline the same spacing here.
export function addParagraphSpacing(html: string): string {
  return html.replace(/<p(\s[^>]*)?>/gi, (_match, attrs: string | undefined) => {
    const existing = attrs ?? "";
    const styleMatch = existing.match(/style="([^"]*)"/i);
    if (styleMatch) {
      const merged = `${styleMatch[1]};margin:0 0 6px 0`;
      return `<p${existing.replace(/style="[^"]*"/i, `style="${merged}"`)}>`;
    }
    return `<p style="margin:0 0 6px 0"${existing}>`;
  });
}

export function renderBlocksToHtml(
  blocks: RenderableBlock[],
  mergeVars: Record<string, string>
): string {
  const rows = blocks.map((block) => renderBlock(block, mergeVars)).join("\n");
  return `<div style="max-width:600px;margin:0 auto;font-family:Verdana,Arial,sans-serif;color:#1e293b;">${rows}</div>`;
}

function renderBlock(block: RenderableBlock, mergeVars: Record<string, string>): string {
  const content = block.content ? resolveMergeTags(block.content, mergeVars) : "";
  const spacedContent = addParagraphSpacing(content);

  switch (block.blockType) {
    case "header":
      return wrap(spacedContent, "font-size:20px;font-weight:700;margin-bottom:12px;");
    case "paragraph":
      return wrap(spacedContent, "font-size:14px;line-height:1.6;margin-bottom:16px;");
    case "list":
      return wrap(spacedContent, "font-size:14px;line-height:1.6;margin-bottom:16px;");
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />`;
    case "spacer":
      return `<div style="height:24px;"></div>`;
    case "line_items":
      return wrap(
        "Line items will appear here automatically when this document is sent.",
        "border:1px dashed #cbd5e1;background:#f8fafc;color:#94a3b8;text-align:center;padding:24px;font-size:12px;margin-bottom:16px;"
      );
    case "signature":
      return wrap(spacedContent, "font-size:13px;line-height:1.6;color:#475569;margin-top:20px;");
    case "image":
      return block.content
        ? wrap(
            `<img src="${block.content}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`,
            "margin-bottom:16px;"
          )
        : wrap(
            "[No image selected]",
            "border:1px dashed #cbd5e1;background:#f8fafc;color:#94a3b8;text-align:center;padding:32px;font-size:12px;margin-bottom:16px;"
          );
    case "button":
      return wrap(
        `<a href="#" style="display:inline-block;background:#60ab45;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${content || "Button"}</a>`,
        "text-align:center;margin:16px 0;"
      );
    default:
      return "";
  }
}
