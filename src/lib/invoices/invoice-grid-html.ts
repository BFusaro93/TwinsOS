import { escapeHtml } from "@/lib/utils/escape-html";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export interface InvoiceGridLine {
  name: string | null;
  description: string;
  qty: number;
  total_cents: number;
  discount_cents?: number | null;
}

// Builds the [invoicegrid] merge tag's value — the invoice's lines as an HTML
// table, styled like [estimategrid] (estimate-grid-html.ts). Registered as
// HTML-safe in document-template-renderer, so every client-entered value is
// escaped here. Each line prints its amount after its own discount.
export function buildInvoiceGridHtml(lines: InvoiceGridLine[]): string {
  if (lines.length === 0) return "";
  const cell = "padding:6px 4px;border-bottom:1px solid #f1f5f9";
  const rows = lines.map((li) => {
    const title = li.name?.trim() || li.description || "";
    const detail = li.name?.trim() && li.description && li.description !== li.name
      ? `<div style="font-weight:400;color:#64748b;font-size:12px">${escapeHtml(li.description)}</div>`
      : "";
    const net = (li.total_cents ?? 0) - Math.max(0, li.discount_cents ?? 0);
    return `<tr>
      <td style="${cell}">${escapeHtml(title)}${detail}</td>
      <td style="${cell};text-align:right;white-space:nowrap">${li.qty}</td>
      <td style="${cell};text-align:right;white-space:nowrap">${fmtCents(net)}</td>
    </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
    <thead><tr style="text-align:left;border-bottom:2px solid #e2e8f0">
      <th style="padding:6px 4px">Description</th>
      <th style="padding:6px 4px;text-align:right">Qty</th>
      <th style="padding:6px 4px;text-align:right">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
