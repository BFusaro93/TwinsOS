import { toast } from "sonner";
import type { PurchaseOrder, Project } from "@/types";
import type { WorkOrder } from "@/types";
import type { CRMJobVisit } from "@/types/crm-jobs";
import { useSettingsStore } from "@/stores/settings-store";
import { stripMentionTokens } from "@/lib/mentions";
import { computeSalesTax } from "@/lib/utils/po-tax";
import { escapeHtml } from "@/lib/utils/escape-html";
import { computeBudgetedHours } from "@/lib/utils/visit-hours";
import { formatDateShort } from "@/lib/utils";

function openPrintWindow(html: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    // window.open returns null when the browser's popup blocker steps in. This
    // replaced a plain window.print() that always worked, so failing silently
    // reads as the Print button being broken.
    toast.error("Your browser blocked the print window — allow pop-ups for this site and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the browser time to render CSS, then open the print/save-as-PDF dialog.
  // Window stays open after printing so the user can re-print or review.
  setTimeout(() => win.print(), 500);
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDateStr(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTimeStr(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildStyles(brandColor: string): string {
  return `
    @page {
      margin: 0.5in;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
      .no-print { display: none !important; }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      font-size: 14px;
      line-height: 1.5;
      padding: 32px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Accent bar ─────────────────────────────────────── */
    .accent-bar {
      height: 4px;
      background: ${brandColor};
      margin-bottom: 32px;
    }

    /* ── Header ─────────────────────────────────────────── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .company-logo {
      max-height: 52px;
      max-width: 200px;
      object-fit: contain;
    }

    .company-name {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }

    .company-address {
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }

    .header-right {
      text-align: right;
    }

    .doc-title {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .doc-number {
      font-size: 14px;
      font-weight: 600;
      color: ${brandColor};
      margin-bottom: 2px;
    }

    .doc-date {
      font-size: 13px;
      color: #64748b;
    }

    /* ── Divider ────────────────────────────────────────── */
    .divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 24px 0;
    }

    /* ── Section headings ───────────────────────────────── */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #f1f5f9;
    }

    /* ── Meta grid ──────────────────────────────────────── */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 40px;
      margin-bottom: 24px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .meta-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #94a3b8;
    }

    .meta-value {
      font-size: 14px;
      font-weight: 500;
      color: #1e293b;
    }

    /* ── Badge ──────────────────────────────────────────── */
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;
    }

    /* ── Table ──────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }

    thead th {
      background: ${brandColor};
      color: #ffffff;
      padding: 10px 14px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    thead th:first-child {
      border-radius: 6px 0 0 0;
    }

    thead th:last-child {
      border-radius: 0 6px 0 0;
    }

    tbody tr:nth-child(odd) {
      background: #f8fafc;
    }

    tbody tr:nth-child(even) {
      background: #ffffff;
    }

    tbody td {
      padding: 9px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }

    .text-right {
      text-align: right;
    }

    /* ── Totals box ─────────────────────────────────────── */
    .totals-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 24px;
    }

    .totals-box {
      width: 280px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 16px;
      font-size: 13px;
    }

    .totals-row .totals-label {
      color: #64748b;
    }

    .totals-row .totals-value {
      font-weight: 500;
      text-align: right;
    }

    .totals-row.grand {
      background: #f8fafc;
      border-top: 2px solid ${brandColor};
      padding: 10px 16px;
      font-size: 15px;
      font-weight: 700;
    }

    .totals-row.grand .totals-label {
      color: #0f172a;
    }

    .totals-row.grand .totals-value {
      color: #0f172a;
      font-weight: 800;
    }

    /* ── Notes ──────────────────────────────────────────── */
    .notes-block {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 18px;
      font-size: 13px;
      color: #334155;
      white-space: pre-wrap;
      margin-bottom: 24px;
    }

    /* ── Description block (WO) ─────────────────────────── */
    .description-block {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 18px;
      font-size: 13px;
      color: #334155;
      white-space: pre-wrap;
      margin-bottom: 24px;
    }

    /* ── Comments ───────────────────────────────────────── */
    .comment-item {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 8px;
    }

    .comment-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;
    }

    .comment-author {
      font-weight: 600;
      color: #1e293b;
    }

    .comment-date {
      color: #94a3b8;
    }

    .comment-body {
      font-size: 13px;
      color: #334155;
      white-space: pre-wrap;
    }

    /* ── Sub-WO list ────────────────────────────────────── */
    .sub-wo-list {
      list-style: none;
      padding: 0;
      margin-bottom: 24px;
    }

    .sub-wo-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 6px;
      font-size: 13px;
    }

    .sub-wo-title {
      font-weight: 500;
    }

    .sub-wo-meta {
      display: flex;
      gap: 12px;
      color: #64748b;
      font-size: 12px;
    }

    /* ── Footer ─────────────────────────────────────────── */
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      margin-top: 32px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
  `;
}

function buildHeaderHtml(opts: {
  logoDataUrl: string | null;
  orgName: string;
  addressLines: string[];
  docTitle: string;
  docNumber: string;
  docDate: string;
}): string {
  const logoHtml = opts.logoDataUrl
    ? `<img src="${opts.logoDataUrl}" alt="${escapeHtml(opts.orgName)}" class="company-logo" />`
    : "";

  return `
    <div class="header">
      <div class="header-left">
        ${logoHtml}
        <div class="company-name">${escapeHtml(opts.orgName)}</div>
        <div class="company-address">
          ${opts.addressLines.map((l) => escapeHtml(l)).join("<br/>")}
        </div>
      </div>
      <div class="header-right">
        <div class="doc-title">${escapeHtml(opts.docTitle)}</div>
        <div class="doc-number">${escapeHtml(opts.docNumber)}</div>
        <div class="doc-date">${opts.docDate}</div>
      </div>
    </div>
  `;
}

function buildFooterHtml(): string {
  return "";
}

function buildCommentsHtml(comments?: Array<{ authorName: string; body: string; createdAt: string }>): string {
  if (!comments || comments.length === 0) return "";
  const items = comments
    .map(
      (c) => `
    <div class="comment-item">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(c.authorName)}</span>
        <span class="comment-date">${formatDateTimeStr(c.createdAt)}</span>
      </div>
      <div class="comment-body">${escapeHtml(stripMentionTokens(c.body))}</div>
    </div>
  `
    )
    .join("");
  return `<div class="section-title">Comments</div>${items}`;
}

export function printPO(
  po: PurchaseOrder,
  projectMap?: Map<string, string>,
  comments?: Array<{ authorName: string; body: string; createdAt: string }>
): void {
  const { orgName, logoDataUrl, companyAddress, brandColor } = useSettingsStore.getState();

  // Mirrors PODetailPanel's totals(): only lines flagged taxable are taxed, the
  // discount is a real line on the printout, and whether it comes off the
  // taxable base first is the PO's own discountReducesTax.
  const subtotal = po.lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0);
  const taxableSubtotal = po.lineItems
    .filter((li) => li.taxable !== false)
    .reduce((s, li) => s + li.quantity * li.unitCost, 0);
  const tax = computeSalesTax({
    taxableSubtotal,
    taxRatePercent: po.taxRatePercent,
    discountCost: po.discountCost,
    discountReducesTax: po.discountReducesTax,
  });
  const grandTotal = subtotal - po.discountCost + tax + po.shippingCost;

  const addressLines = [
    companyAddress.street,
    [companyAddress.city, companyAddress.state, companyAddress.zip].filter(Boolean).join(", "),
    companyAddress.phone,
  ].filter(Boolean);

  const headerHtml = buildHeaderHtml({
    logoDataUrl,
    orgName,
    addressLines,
    docTitle: "Purchase Order",
    docNumber: po.poNumber,
    docDate: formatDateStr(po.createdAt),
  });

  const rows = po.lineItems
    .map(
      (li, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(li.productItemName)}</td>
      <td>${li.partNumber ? escapeHtml(li.partNumber) : "\u2014"}</td>
      <td>${li.projectId ? escapeHtml(projectMap?.get(li.projectId) ?? li.projectId) : "\u2014"}</td>
      <td class="text-right">${li.quantity}</td>
      <td class="text-right">${formatMoney(li.unitCost)}</td>
      <td class="text-right">${formatMoney(li.quantity * li.unitCost)}</td>
    </tr>
  `
    )
    .join("");

  const metaItems: Array<{ label: string; value: string }> = [
    { label: "Vendor", value: po.vendorName },
    { label: "Status", value: formatStatus(po.status) },
  ];
  if (po.paymentType) {
    metaItems.push({ label: "Payment Type", value: formatStatus(po.paymentType) });
  }
  if (po.invoiceNumber) {
    metaItems.push({ label: "Invoice #", value: po.invoiceNumber });
  }
  if (po.poDate) {
    metaItems.push({ label: "PO Date", value: formatDateStr(po.poDate) });
  }

  const metaHtml = metaItems
    .map(
      (m) => `
    <div class="meta-item">
      <span class="meta-label">${escapeHtml(m.label)}</span>
      <span class="meta-value">${escapeHtml(m.value)}</span>
    </div>
  `
    )
    .join("");

  const totalsRows = [
    `<div class="totals-row"><span class="totals-label">Subtotal</span><span class="totals-value">${formatMoney(subtotal)}</span></div>`,
  ];
  if (po.discountCost > 0) {
    totalsRows.push(
      `<div class="totals-row"><span class="totals-label">Discount</span><span class="totals-value">-${formatMoney(po.discountCost)}</span></div>`
    );
  }
  if (po.taxRatePercent > 0) {
    totalsRows.push(
      `<div class="totals-row"><span class="totals-label">Tax (${po.taxRatePercent}%)</span><span class="totals-value">${formatMoney(tax)}</span></div>`
    );
  }
  if (po.shippingCost > 0) {
    totalsRows.push(
      `<div class="totals-row"><span class="totals-label">Shipping</span><span class="totals-value">${formatMoney(po.shippingCost)}</span></div>`
    );
  }
  totalsRows.push(
    `<div class="totals-row grand"><span class="totals-label">Grand Total</span><span class="totals-value">${formatMoney(grandTotal)}</span></div>`
  );

  const notesHtml = po.notes
    ? `<div class="section-title">Notes</div><div class="notes-block">${escapeHtml(po.notes)}</div>`
    : "";

  const commentsHtml = buildCommentsHtml(comments);

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>PO ${escapeHtml(po.poNumber)}</title>
  <style>${buildStyles(brandColor)}</style>
</head>
<body>
  <div class="accent-bar"></div>
  ${headerHtml}
  <hr class="divider"/>

  <div class="section-title">Details</div>
  <div class="meta-grid">
    ${metaHtml}
  </div>

  <div class="section-title">Line Items</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item</th>
        <th>Part #</th>
        <th>Project</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Cost</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals-wrapper">
    <div class="totals-box">
      ${totalsRows.join("")}
    </div>
  </div>

  ${notesHtml}

  ${commentsHtml}

  ${buildFooterHtml()}
</body>
</html>`;

  openPrintWindow(html);
}

export function printWO(
  workOrder: WorkOrder,
  woParts?: Array<{ partName: string; partNumber: string; quantity: number; unitCost: number }>,
  comments?: Array<{ authorName: string; body: string; createdAt: string }>,
  laborEntries?: Array<{ technicianName: string; description: string; hours: number; hourlyRate: number }>,
  vendorCharges?: Array<{ vendorName: string; description: string; cost: number }>
): void {
  const { orgName, logoDataUrl, companyAddress, brandColor } = useSettingsStore.getState();

  const addressLines = [
    companyAddress.street,
    [companyAddress.city, companyAddress.state, companyAddress.zip].filter(Boolean).join(", "),
    companyAddress.phone,
  ].filter(Boolean);

  const headerHtml = buildHeaderHtml({
    logoDataUrl,
    orgName,
    addressLines,
    docTitle: "Work Order",
    docNumber: workOrder.workOrderNumber,
    docDate: formatDateStr(workOrder.createdAt),
  });

  const assignedNames =
    workOrder.assignedToNames && workOrder.assignedToNames.length > 0
      ? workOrder.assignedToNames.join(", ")
      : workOrder.assignedToName ?? "\u2014";

  const categoryLabels =
    workOrder.categories && workOrder.categories.length > 0
      ? workOrder.categories
          .map((c) => formatStatus(c))
          .join(", ")
      : workOrder.category
        ? formatStatus(workOrder.category)
        : null;

  const metaItems: Array<{ label: string; value: string }> = [
    { label: "Status", value: formatStatus(workOrder.status) },
    { label: "Priority", value: formatStatus(workOrder.priority) },
  ];
  if (workOrder.woType) {
    metaItems.push({ label: "Type", value: formatStatus(workOrder.woType) });
  }
  if (workOrder.assetName) {
    metaItems.push({ label: "Asset", value: workOrder.assetName });
  }
  if (workOrder.dueDate) {
    metaItems.push({ label: "Due Date", value: formatDateStr(workOrder.dueDate) });
  }
  metaItems.push({ label: "Assigned To", value: assignedNames });
  if (categoryLabels) {
    metaItems.push({ label: "Categories", value: categoryLabels });
  }

  const metaHtml = metaItems
    .map(
      (m) => `
    <div class="meta-item">
      <span class="meta-label">${escapeHtml(m.label)}</span>
      <span class="meta-value">${escapeHtml(m.value)}</span>
    </div>
  `
    )
    .join("");

  const descriptionHtml = workOrder.description
    ? `<div class="section-title">Description</div><div class="description-block">${escapeHtml(workOrder.description)}</div>`
    : "";

  const commentsHtml = buildCommentsHtml(comments);

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>WO ${escapeHtml(workOrder.workOrderNumber)}</title>
  <style>${buildStyles(brandColor)}</style>
</head>
<body>
  <div class="accent-bar"></div>
  ${headerHtml}
  <hr class="divider"/>

  <div class="section-title">Details</div>
  <div class="meta-grid">
    ${metaHtml}
  </div>

  ${descriptionHtml}

  ${woParts && woParts.length > 0 ? `
  <div class="section-title">Parts</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Part</th>
        <th>Part #</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Cost</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${woParts.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.partName)}</td>
        <td>${p.partNumber ? escapeHtml(p.partNumber) : "\u2014"}</td>
        <td class="text-right">${p.quantity}</td>
        <td class="text-right">${formatMoney(p.unitCost)}</td>
        <td class="text-right">${formatMoney(p.quantity * p.unitCost)}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>
  ` : ""}

  ${laborEntries && laborEntries.length > 0 ? `
  <div class="section-title">Labor</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Technician</th>
        <th>Description</th>
        <th class="text-right">Hours</th>
        <th class="text-right">Rate</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${laborEntries.map((l, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(l.technicianName)}</td>
        <td>${l.description ? escapeHtml(l.description) : "\u2014"}</td>
        <td class="text-right">${l.hours}</td>
        <td class="text-right">${formatMoney(l.hourlyRate)}</td>
        <td class="text-right">${formatMoney(Math.round(l.hours * l.hourlyRate))}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>
  ` : ""}

  ${vendorCharges && vendorCharges.length > 0 ? `
  <div class="section-title">Vendor Charges</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Vendor</th>
        <th>Description</th>
        <th class="text-right">Cost</th>
      </tr>
    </thead>
    <tbody>
      ${vendorCharges.map((v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(v.vendorName)}</td>
        <td>${v.description ? escapeHtml(v.description) : "\u2014"}</td>
        <td class="text-right">${formatMoney(v.cost)}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>
  ` : ""}

  ${(() => {
    const partsTotal = (woParts ?? []).reduce((s, p) => s + p.quantity * p.unitCost, 0);
    const laborTotal = (laborEntries ?? []).reduce((s, l) => s + Math.round(l.hours * l.hourlyRate), 0);
    const vendorTotal = (vendorCharges ?? []).reduce((s, v) => s + v.cost, 0);
    const grandTotal = partsTotal + laborTotal + vendorTotal;
    if (grandTotal === 0) return "";
    return `
  <div class="totals-wrapper">
    <div class="totals-box">
      ${partsTotal > 0 ? `<div class="totals-row"><span class="totals-label">Parts Total</span><span class="totals-value">${formatMoney(partsTotal)}</span></div>` : ""}
      ${laborTotal > 0 ? `<div class="totals-row"><span class="totals-label">Labor Total</span><span class="totals-value">${formatMoney(laborTotal)}</span></div>` : ""}
      ${vendorTotal > 0 ? `<div class="totals-row"><span class="totals-label">Vendor Charges Total</span><span class="totals-value">${formatMoney(vendorTotal)}</span></div>` : ""}
      <div class="totals-row grand">
        <span class="totals-label">Total Cost</span>
        <span class="totals-value">${formatMoney(grandTotal)}</span>
      </div>
    </div>
  </div>
  `;
  })()}

  ${commentsHtml}

  ${buildFooterHtml()}
</body>
</html>`;

  openPrintWindow(html);
}

export function printProject(
  project: Project,
  materials: Array<{ productItemName: string; partNumber: string; quantity: number; unitCost: number; sourceNumber: string; sourceType: string }>,
): void {
  const { orgName, logoDataUrl, companyAddress, brandColor } = useSettingsStore.getState();

  const addressLines = [
    companyAddress.street,
    [companyAddress.city, companyAddress.state, companyAddress.zip].filter(Boolean).join(", "),
    companyAddress.phone,
  ].filter(Boolean);

  const headerHtml = buildHeaderHtml({
    logoDataUrl,
    orgName,
    addressLines,
    docTitle: "Project",
    docNumber: project.name,
    docDate: formatDateStr(project.startDate),
  });

  const metaItems: Array<{ label: string; value: string }> = [
    { label: "Customer", value: project.customerName },
    { label: "Status", value: formatStatus(project.status) },
    { label: "Address", value: project.address },
    { label: "Start Date", value: formatDateStr(project.startDate) },
  ];
  if (project.endDate) {
    metaItems.push({ label: "End Date", value: formatDateStr(project.endDate) });
  }
  metaItems.push({ label: "Total Cost", value: formatMoney(project.totalCost) });

  const metaHtml = metaItems
    .map(
      (m) => `
    <div class="meta-item">
      <span class="meta-label">${escapeHtml(m.label)}</span>
      <span class="meta-value">${escapeHtml(m.value)}</span>
    </div>
  `
    )
    .join("");

  const materialsTotal = materials.reduce((s, m) => s + m.quantity * m.unitCost, 0);

  const materialsHtml = materials.length > 0 ? `
  <div class="section-title">Materials</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item</th>
        <th>Part #</th>
        <th>Source</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Cost</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${materials.map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(m.productItemName)}</td>
        <td>${m.partNumber ? escapeHtml(m.partNumber) : "\u2014"}</td>
        <td>${escapeHtml(m.sourceNumber)}</td>
        <td class="text-right">${m.quantity}</td>
        <td class="text-right">${formatMoney(m.unitCost)}</td>
        <td class="text-right">${formatMoney(m.quantity * m.unitCost)}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="totals-wrapper">
    <div class="totals-box">
      <div class="totals-row grand">
        <span class="totals-label">Materials Total</span>
        <span class="totals-value">${formatMoney(materialsTotal)}</span>
      </div>
    </div>
  </div>
  ` : "";

  const notesHtml = project.notes
    ? `<div class="section-title">Notes</div><div class="notes-block">${escapeHtml(project.notes)}</div>`
    : "";

  const projHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Project: ${escapeHtml(project.name)}</title>
  <style>${buildStyles(brandColor)}</style>
</head>
<body>
  <div class="accent-bar"></div>
  ${headerHtml}
  <hr class="divider"/>

  <div class="section-title">Details</div>
  <div class="meta-grid">
    ${metaHtml}
  </div>

  ${materialsHtml}

  ${notesHtml}

  ${buildFooterHtml()}
</body>
</html>`;

  openPrintWindow(projHtml);
}

// ── route sheets ────────────────────────────────────────────────────────────

const ROUTE_SHEET_STYLES = `
  .rs-page + .rs-page { page-break-before: always; }
  .rs-section + .rs-section { margin-top: 32px; }
  .rs-crew-header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 12px; }
  .rs-crew-header h2 { font-size: 16px; font-weight: 700; color: #0f172a; }
  .rs-crew-header .rs-date { font-size: 13px; color: #64748b; }
  .rs-roster { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 16px; }
  .rs-roster table { width: auto; flex: 1; margin-bottom: 0; font-size: 12px; }
  .rs-roster th { background: none; color: #334155; padding: 2px 10px 6px 0; text-align: left; font-size: 11px; text-transform: none; font-weight: 600; }
  .rs-roster td { padding: 6px 10px 6px 0; border-bottom: 1px solid #cbd5e1; }
  .rs-side { width: 190px; flex-shrink: 0; font-size: 12px; padding-top: 20px; }
  .rs-side-row { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 8px; }
  .rs-side-row:last-child { border-bottom: none; font-weight: 700; }
  .rs-blank { display: inline-block; border-bottom: 1px solid #94a3b8; min-width: 40px; }
  .rs-blank.wide { min-width: 90px; }
  .rs-blank.full { display: block; width: 100%; min-height: 14px; }
  .rs-job { border-bottom: 1px solid #cbd5e1; padding: 10px 0; page-break-inside: avoid; }
  .rs-job-top { display: flex; justify-content: space-between; gap: 12px; }
  .rs-job-title { font-size: 13px; font-weight: 700; color: #0f172a; }
  .rs-job-service { font-size: 12px; color: #475569; }
  .rs-job-meta { text-align: right; font-size: 11px; color: #64748b; white-space: nowrap; }
  .rs-job-meta b { color: #1e293b; }
  .rs-job-fields { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-top: 8px; font-size: 12px; }
  .rs-job-extra { margin-top: 6px; font-size: 12px; }
  .rs-job-extra b { font-weight: 600; }
  .rs-compact-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
  .rs-compact-table th, .rs-compact-table td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
  .rs-compact-table th { background: #f1f5f9; color: #334155; }
`;

const RS_VISIT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", dispatched: "Dispatched", in_progress: "In Progress",
  completed: "Completed", cancelled: "Cancelled", skipped: "Skipped",
};

function rsCrewNotes(v: CRMJobVisit): string {
  return v.notesToCrew ?? v.job?.notesToCrew ?? v.job?.propertyNotesToCrew ?? "";
}

function rsFormatEstHrsMins(hours: number | null | undefined): string {
  if (hours == null) return "—";
  const totalMins = Math.round(hours * 60);
  return `${Math.floor(totalMins / 60)} hrs / ${totalMins % 60} mins`;
}

function rsFormatLongDate(iso: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(d);
}

function rsCompactTable(visits: CRMJobVisit[]): string {
  const rows = visits.map((v, i) => {
    const job = v.job;
    const svc = (job?.services ?? []).map((s) => s.serviceName).join(", ");
    const addr = [job?.serviceAddress, job?.serviceCity].filter(Boolean).join(", ");
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(v.clientName ?? "—")}</td>
        <td>${escapeHtml(addr || "—")}</td>
        <td>${escapeHtml(svc || "—")}</td>
        <td>${escapeHtml(v.startTime ?? "—")}</td>
        <td>${computeBudgetedHours(v)?.toFixed(1) ?? "—"}</td>
        <td><span class="rs-blank full"></span></td>
        <td><span class="rs-blank full"></span></td>
        <td>${escapeHtml(rsCrewNotes(v))}</td>
      </tr>`;
  }).join("");
  return `
    <table class="rs-compact-table">
      <thead>
        <tr>
          <th>#</th><th>Client</th><th>Address</th><th>Service</th><th>Sched.</th>
          <th>B Hrs</th><th>Start</th><th>End</th><th>Notes to Crew</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function rsJobCard(v: CRMJobVisit, i: number): string {
  const job = v.job;
  const svc = (job?.services ?? []).map((s) => s.serviceName).join(", ");
  const addr = [job?.serviceAddress, [job?.serviceCity, job?.serviceZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const title = [v.clientName, addr].filter(Boolean).join(" - ");
  const notes = rsCrewNotes(v);
  const gateCode = job?.propertyGateCode;
  const turfSqft = job?.propertyTurfSqft;

  return `
    <div class="rs-job">
      <div class="rs-job-top">
        <div>
          <div class="rs-job-title">${i + 1}. ${escapeHtml(title || "—")}</div>
          <div class="rs-job-service">${escapeHtml(svc || "—")}</div>
        </div>
        <div class="rs-job-meta">
          <div>Status: <b>${escapeHtml(RS_VISIT_STATUS_LABELS[v.status] ?? v.status)}</b></div>
          <div>Map Code: ${escapeHtml(job?.mapCode ?? "—")}</div>
          <div>Priority: <b>${v.effectiveHighPriority ? "High" : "Normal"}</b></div>
        </div>
      </div>
      <div class="rs-job-fields">
        <span>Start Time: <span class="rs-blank"></span></span>
        <span>End Time: <span class="rs-blank"></span></span>
        <span>Est: ${rsFormatEstHrsMins(computeBudgetedHours(v))}</span>
        <span># of Men: <span class="rs-blank"></span></span>
        <span>Materials Used: <span class="rs-blank wide"></span></span>
        ${job?.lastServiceDate ? `<span>Last: ${escapeHtml(formatDateShort(job.lastServiceDate))}</span>` : ""}
      </div>
      ${turfSqft != null ? `<div class="rs-job-extra"><b>Turf Sq. Ft.</b> ${turfSqft.toLocaleString()}</div>` : ""}
      ${gateCode ? `<div class="rs-job-extra"><b>Gate/Lock Code</b> ${escapeHtml(gateCode)}</div>` : ""}
      ${notes ? `<div class="rs-job-extra"><b>Notes to Crew</b> ${escapeHtml(notes)}</div>` : ""}
    </div>`;
}

function rsRosterHeader(members: { id: string; employeeName?: string | null; resourceCode?: string | null }[], jobCount: number): string {
  const rows = (members.length > 0 ? members : [null]).map((m) => `
    <tr>
      <td>${m ? escapeHtml(`${m.employeeName ?? "—"}${m.resourceCode ? ` (${m.resourceCode})` : ""}`) : "&nbsp;"}</td>
      <td><span class="rs-blank full"></span></td>
      <td><span class="rs-blank full"></span></td>
      <td><span class="rs-blank full"></span></td>
    </tr>`).join("");
  return `
    <div class="rs-roster">
      <table>
        <thead><tr><th>Assigned Resource:</th><th>Start:</th><th>End:</th><th>Total Hrs:</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="rs-side">
        <div class="rs-side-row"><span>Truck #:</span><span class="rs-blank wide"></span></div>
        <div class="rs-side-row"><span>Start Mileage:</span><span class="rs-blank wide"></span></div>
        <div class="rs-side-row"><span>End Mileage:</span><span class="rs-blank wide"></span></div>
        <div class="rs-side-row"><span>Job Count:</span><span>${jobCount}</span></div>
      </div>
    </div>`;
}

function rsDetailedSheet(label: string, members: { id: string; employeeName?: string | null; resourceCode?: string | null }[], visits: CRMJobVisit[], dateLabel: string): string {
  return `
    <div class="rs-page">
      <div class="rs-crew-header"><h2>${escapeHtml(label)}</h2><span class="rs-date">${escapeHtml(dateLabel)}</span></div>
      ${rsRosterHeader(members, visits.length)}
      ${visits.map((v, i) => rsJobCard(v, i)).join("")}
    </div>`;
}

/**
 * Prints daily crew route sheets in a separate window — mirrors the on-screen
 * preview in DispatchBoard's PrintDialog, but as an isolated document so
 * printing doesn't capture the app chrome behind the dialog.
 */
export function printRouteSheets(
  selectedDate: string,
  format: "compact" | "detailed",
  crews: { id: string; name: string; members: { id: string; employeeName?: string | null; resourceCode?: string | null }[] }[],
  visits: CRMJobVisit[]
): void {
  const { brandColor } = useSettingsStore.getState();
  const dateLabel = rsFormatLongDate(selectedDate);

  // crm_job_visits.crew_id is null whenever the visit inherits its crew from
  // the job, which is the common case for recurring work. Grouping on the raw
  // column put every one of those stops on a single "Unassigned" sheet and left
  // the crew actually running them with no route sheet — resolve the same way
  // the board's own contract does (DispatchBoard's effectiveCrewId).
  const effectiveCrewIdOf = (v: CRMJobVisit) => v.crewId ?? v.job?.crewId ?? null;
  const byCrew = crews
    .map((c) => ({ crew: c, visits: visits.filter((v) => effectiveCrewIdOf(v) === c.id) }))
    .filter((x) => x.visits.length > 0);
  const unassigned = visits.filter((v) => !effectiveCrewIdOf(v));

  const sections = [
    ...byCrew.map(({ crew, visits: cv }) =>
      format === "detailed"
        ? rsDetailedSheet(crew.name, crew.members, cv, dateLabel)
        : `<div class="rs-section"><div class="rs-crew-header"><h2>${escapeHtml(crew.name)}</h2><span class="rs-date">${cv.length} stop${cv.length !== 1 ? "s" : ""} · ${escapeHtml(dateLabel)}</span></div>${rsCompactTable(cv)}</div>`
    ),
    ...(unassigned.length > 0
      ? [format === "detailed"
        ? rsDetailedSheet("Unassigned", [], unassigned, dateLabel)
        : `<div class="rs-section"><div class="rs-crew-header"><h2>Unassigned</h2><span class="rs-date">${unassigned.length} stop${unassigned.length !== 1 ? "s" : ""} · ${escapeHtml(dateLabel)}</span></div>${rsCompactTable(unassigned)}</div>`]
      : []),
  ];

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Route Sheets — ${escapeHtml(selectedDate)}</title>
  <style>${buildStyles(brandColor)}${ROUTE_SHEET_STYLES}</style>
</head>
<body>
  ${sections.join("") || `<p style="color:#94a3b8;">No visits to print for this date.</p>`}
</body>
</html>`;

  openPrintWindow(html);
}

function snowRouteTable(cv: CRMJobVisit[]): string {
  const rows = cv.map((v, i) => {
    const job = v.job;
    const addr = [job?.serviceAddress, job?.serviceCity].filter(Boolean).join(", ");
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(v.clientName ?? "—")}</td>
        <td>${escapeHtml(addr || "—")}</td>
        <td>&#9744; Snowing &#9744; Freezing Rain &#9744; Clear</td>
        <td>&#9744; Ice &#9744; Slush &#9744; Dry</td>
        <td style="text-align:center">&#9744;</td>
        <td></td>
      </tr>`;
  }).join("");
  return `
    <table class="rs-compact-table">
      <thead>
        <tr>
          <th>#</th><th>Client</th><th>Address</th><th>Weather Conditions</th>
          <th>Site Conditions</th><th style="text-align:center">Full Plow</th><th style="text-align:center">Salt (bags)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Prints snow route sheets in a separate window — mirrors DispatchBoard's
 * printRouteSheets but for storm-event visits, which have their own
 * weather/site-condition/salt columns instead of the landscaping route
 * sheet's fields.
 */
export function printSnowRouteSheets(
  eventLabel: string,
  crews: { id: string; name: string }[],
  visits: CRMJobVisit[]
): void {
  const { brandColor } = useSettingsStore.getState();

  const byCrew = crews
    .map((c) => ({ crew: c, visits: visits.filter((v) => v.crewId === c.id) }))
    .filter((x) => x.visits.length > 0);
  const unassigned = visits.filter((v) => !v.crewId);

  const sections = [
    ...byCrew.map(({ crew, visits: cv }) => `
      <div class="rs-section">
        <div class="rs-crew-header"><h2>${escapeHtml(crew.name)}</h2><span class="rs-date">${cv.length} stop${cv.length !== 1 ? "s" : ""}</span></div>
        ${snowRouteTable(cv)}
      </div>`),
    ...(unassigned.length > 0 ? [`
      <div class="rs-section">
        <div class="rs-crew-header"><h2>Unassigned</h2><span class="rs-date">${unassigned.length} stop${unassigned.length !== 1 ? "s" : ""}</span></div>
        ${snowRouteTable(unassigned)}
      </div>`] : []),
  ];

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Print Route Sheets — ${escapeHtml(eventLabel)}</title>
  <style>${buildStyles(brandColor)}${ROUTE_SHEET_STYLES}</style>
</head>
<body>
  ${sections.join("") || `<p style="color:#94a3b8;">No visits to print.</p>`}
</body>
</html>`;

  openPrintWindow(html);
}

// ── damage case ──────────────────────────────────────────────────────────────

export function printDamageCase(
  damageCase: {
    caseNumber: string;
    caseType: string;
    status: string;
    customerName: string;
    propertyAddress: string | null;
    dateOfIncident: string;
    description: string;
    resolutionNotes: string | null;
    totalCost: number;
  },
  expenses: Array<{ expenseDate: string; vendorName: string | null; description: string; amount: number }>
): void {
  const { orgName, logoDataUrl, companyAddress, brandColor } = useSettingsStore.getState();

  const addressLines = [
    companyAddress.street,
    [companyAddress.city, companyAddress.state, companyAddress.zip].filter(Boolean).join(", "),
    companyAddress.phone,
  ].filter(Boolean);

  const headerHtml = buildHeaderHtml({
    logoDataUrl,
    orgName,
    addressLines,
    docTitle: "Damage Case",
    docNumber: damageCase.caseNumber,
    docDate: formatDateStr(damageCase.dateOfIncident),
  });

  const metaItems: Array<{ label: string; value: string }> = [
    { label: "Customer", value: damageCase.customerName },
    { label: "Status", value: formatStatus(damageCase.status) },
    { label: "Type", value: formatStatus(damageCase.caseType) },
    { label: "Date of Incident", value: formatDateStr(damageCase.dateOfIncident) },
  ];
  if (damageCase.propertyAddress) {
    metaItems.push({ label: "Property Address", value: damageCase.propertyAddress });
  }

  const metaHtml = metaItems
    .map(
      (m) => `
    <div class="meta-item">
      <span class="meta-label">${escapeHtml(m.label)}</span>
      <span class="meta-value">${escapeHtml(m.value)}</span>
    </div>
  `
    )
    .join("");

  const descriptionHtml = damageCase.description
    ? `<div class="section-title">Description</div><div class="description-block">${escapeHtml(damageCase.description)}</div>`
    : "";

  const expensesHtml = expenses.length > 0 ? `
  <div class="section-title">Expenses</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th>Vendor</th>
        <th>Description</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${expenses.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${formatDateStr(e.expenseDate)}</td>
        <td>${e.vendorName ? escapeHtml(e.vendorName) : "—"}</td>
        <td>${escapeHtml(e.description)}</td>
        <td class="text-right">${formatMoney(e.amount)}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>
  <div class="totals-wrapper">
    <div class="totals-box">
      <div class="totals-row grand">
        <span class="totals-label">Total Cost</span>
        <span class="totals-value">${formatMoney(damageCase.totalCost)}</span>
      </div>
    </div>
  </div>
  ` : "";

  const notesHtml = damageCase.resolutionNotes
    ? `<div class="section-title">Resolution Notes</div><div class="notes-block">${escapeHtml(damageCase.resolutionNotes)}</div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Damage Case ${escapeHtml(damageCase.caseNumber)}</title>
  <style>${buildStyles(brandColor)}</style>
</head>
<body>
  <div class="accent-bar"></div>
  ${headerHtml}
  <hr class="divider"/>

  <div class="section-title">Details</div>
  <div class="meta-grid">
    ${metaHtml}
  </div>

  ${descriptionHtml}

  ${expensesHtml}

  ${notesHtml}
</body>
</html>`;

  openPrintWindow(html);
}
