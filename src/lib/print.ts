import type { PurchaseOrder, Project } from "@/types";
import type { WorkOrder } from "@/types";
import { useSettingsStore } from "@/stores/settings-store";

function openPrintWindow(html: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Open as preview only — user can print via Ctrl+P / Cmd+P or browser menu
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

export function printPO(po: PurchaseOrder, projectMap?: Map<string, string>): void {
  const { orgName, logoDataUrl, companyAddress, brandColor } = useSettingsStore.getState();

  const subtotal = po.lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0);
  const tax = Math.round((subtotal * po.taxRatePercent) / 100);
  const grandTotal = subtotal + tax + po.shippingCost;

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

  ${buildFooterHtml()}
</body>
</html>`;

  openPrintWindow(html);
}

export function printWO(workOrder: WorkOrder, woParts?: Array<{ partName: string; partNumber: string; quantity: number; unitCost: number }>): void {
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

  <div class="totals-wrapper">
    <div class="totals-box">
      <div class="totals-row grand">
        <span class="totals-label">Parts Total</span>
        <span class="totals-value">${formatMoney(woParts.reduce((s, p) => s + p.quantity * p.unitCost, 0))}</span>
      </div>
    </div>
  </div>
  ` : ""}

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
