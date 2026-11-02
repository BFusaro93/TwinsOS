import type { EstimatePDFLineItem } from "@/components/crm/estimates/pdf/EstimateDocument";
import { packageLineNetCents } from "@/lib/estimates/package-line-net";
import { escapeHtml } from "@/lib/utils/escape-html";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/estimate-display-settings";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Builds the [estimategrid] merge tag's value — an HTML table of the
// estimate's line items, the same rows the attached PDF prints (see
// pdfLineItems below). Registered as HTML-safe in document-template-renderer
// so it isn't double-escaped when substituted into the email body.
//
// A package (Add Package: a section row carrying packageId, then its lines)
// prints like the page and PDF: one main row with the package name, wording and
// total, and its visits listed beneath only when showPackageVisits is on.
export function buildEstimateGridHtml(
  lineItems: EstimatePDFLineItem[],
  settings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS,
): string {
  if (lineItems.length === 0) return "";
  const cell = "padding:6px 4px;border-bottom:1px solid #f1f5f9";
  // Lines printed under a package's section row; any package line without a
  // section row ahead of it (header deleted or reordered) prints as a plain row.
  const printedByPackage = new Set<number>();
  const rows = lineItems.map((li, idx) => {
    if (li.rowType === "section" && li.packageId) {
      const visits: EstimatePDFLineItem[] = [];
      for (let j = idx + 1; j < lineItems.length && lineItems[j].rowType !== "section" && lineItems[j].packageId === li.packageId; j++) {
        visits.push(lineItems[j]);
        printedByPackage.add(j);
      }
      // A package whose visits were all removed has nothing to sell — print nothing.
      if (visits.length === 0) return "";
      const total = visits.reduce((sum, v) => sum + packageLineNetCents(v), 0);
      const wording = li.estimateDesc ? `<div style="font-weight:400;color:#64748b;font-size:12px">${escapeHtml(li.estimateDesc)}</div>` : "";
      const main = `<tr>
      <td style="${cell};font-weight:700">${escapeHtml(li.sectionName ?? "Package")}${wording}</td>
      <td style="${cell}"></td>
      <td style="${cell};text-align:right;white-space:nowrap;font-weight:700">${fmtCents(total)}</td>
    </tr>`;
      if (!settings.showPackageVisits) return main;
      return main + visits.map((v) => `<tr>
      <td style="padding:2px 4px 2px 20px;border-bottom:1px solid #f8fafc;color:#64748b;font-size:12px">${escapeHtml(v.serviceName || v.estimateDesc || "")}</td>
      <td style="padding:2px 4px;border-bottom:1px solid #f8fafc;color:#64748b;font-size:12px;text-align:right;white-space:nowrap">${v.qty}${v.unitType ? " " + escapeHtml(v.unitType) : ""}</td>
      <td style="padding:2px 4px;border-bottom:1px solid #f8fafc;color:#64748b;font-size:12px;text-align:right;white-space:nowrap">${fmtCents(v.totalCents)}</td>
    </tr>`).join("");
    }
    // A package's lines are printed by its section row above.
    if (printedByPackage.has(idx)) return "";
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
