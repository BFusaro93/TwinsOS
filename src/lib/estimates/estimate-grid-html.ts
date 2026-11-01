import type { EstimatePDFLineItem } from "@/components/crm/estimates/pdf/EstimateDocument";
import { escapeHtml } from "@/lib/utils/escape-html";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Builds the [estimategrid] merge tag's value — an HTML table of the
// estimate's line items, the same rows the attached PDF prints (see
// pdfLineItems below). Registered as HTML-safe in document-template-renderer
// so it isn't double-escaped when substituted into the email body.
export function buildEstimateGridHtml(lineItems: EstimatePDFLineItem[]): string {
  if (lineItems.length === 0) return "";
  const rows = lineItems.map((li) => {
    if (li.rowType === "section") {
      return `<tr><td colspan="3" style="padding:10px 4px 4px;font-weight:700;border-bottom:1px solid #e2e8f0">${escapeHtml(li.sectionName ?? "")}</td></tr>`;
    }
    const desc = escapeHtml(li.serviceName || li.estimateDesc || "");
    return `<tr>
      <td style="padding:6px 4px;border-bottom:1px solid #f1f5f9">${desc}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap">${li.qty}${li.unitType ? " " + escapeHtml(li.unitType) : ""}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap">${fmtCents(li.totalCents)}</td>
    </tr>${(li.subitems ?? []).map((sub) => `<tr>
      <td style="padding:2px 4px 2px 20px;border-bottom:1px solid #f8fafc;color:#64748b;font-size:12px">${escapeHtml(sub.name)}</td>
      <td style="padding:2px 4px;border-bottom:1px solid #f8fafc;color:#64748b;font-size:12px;text-align:right;white-space:nowrap">${sub.qty}</td>
      <td style="padding:2px 4px;border-bottom:1px solid #f8fafc;color:#64748b;font-size:12px;text-align:right;white-space:nowrap">${fmtCents(sub.totalCents)}</td>
    </tr>`).join("")}`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
    <thead><tr style="text-align:left;border-bottom:2px solid #e2e8f0">
      <th style="padding:6px 4px">Description</th>
      <th style="padding:6px 4px;text-align:right">Qty</th>
      <th style="padding:6px 4px;text-align:right">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
