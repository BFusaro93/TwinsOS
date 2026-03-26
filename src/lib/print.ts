import type { PurchaseOrder } from "@/types";
import type { WorkOrder } from "@/types";
import { useSettingsStore } from "@/stores/settings-store";

function openPrintWindow(html: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 500);
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDateStr(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const PRINT_STYLES = `
  body { font-family: system-ui, sans-serif; color: #1e293b; margin: 0; padding: 32px; font-size: 13px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 24px 0 8px; }
  .meta { display: grid; grid-template-columns: 140px 1fr; gap: 4px 16px; }
  .meta dt { color: #64748b; }
  .meta dd { font-weight: 500; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f8fafc; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .right { text-align: right; }
  .totals { margin-top: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .totals .row { display: flex; gap: 48px; justify-content: flex-end; }
  .totals .row.grand { font-weight: 700; font-size: 15px; border-top: 2px solid #1e293b; padding-top: 8px; margin-top: 4px; }
  .totals label { color: #64748b; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #f1f5f9; color: #475569; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
  .org { font-size: 12px; color: #64748b; text-align: right; }
`;

export function printPO(po: PurchaseOrder): void {
  const { orgName, logoDataUrl, companyAddress } = useSettingsStore.getState();

  const subtotal = po.lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0);
  const tax = Math.round((subtotal * po.taxRatePercent) / 100);
  const grandTotal = subtotal + tax + po.shippingCost;

  const rows = po.lineItems
    .map(
      (li) => `
    <tr>
      <td>${li.productItemName}</td>
      <td class="right">${li.quantity}</td>
      <td class="right">${formatMoney(li.unitCost)}</td>
      <td class="right">${formatMoney(li.quantity * li.unitCost)}</td>
    </tr>
  `
    )
    .join("");

  const addressLines = [
    companyAddress.street,
    [companyAddress.city, companyAddress.state, companyAddress.zip].filter(Boolean).join(", "),
    companyAddress.phone,
  ].filter(Boolean);

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="${orgName}" style="max-height:48px;max-width:180px;object-fit:contain;display:block;margin-bottom:4px;" />`
    : "";

  const html = `<!DOCTYPE html><html><head><title>PO ${po.poNumber}</title><style>${PRINT_STYLES}</style></head><body>
    <div class="header-row">
      <div>
        <h1>Purchase Order</h1>
        <span class="badge">${po.poNumber}</span>
      </div>
      <div class="org">
        ${logoHtml}
        <strong>${orgName}</strong><br/>
        ${addressLines.map((l) => `${l}<br/>`).join("")}
        Date: ${formatDateStr(po.createdAt)}<br/>
        Status: ${po.status.replace(/_/g, " ")}
      </div>
    </div>
    <hr/>
    <h2>Vendor</h2>
    <dl class="meta">
      <dt>Name</dt><dd>${po.vendorName}</dd>
      ${po.invoiceNumber ? `<dt>Invoice #</dt><dd>${po.invoiceNumber}</dd>` : ""}
      ${po.paymentType ? `<dt>Payment</dt><dd>${po.paymentType}</dd>` : ""}
    </dl>
    <h2>Line Items</h2>
    <table>
      <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Unit Cost</th><th class="right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><label>Subtotal</label><span>${formatMoney(subtotal)}</span></div>
      ${po.taxRatePercent > 0 ? `<div class="row"><label>Tax (${po.taxRatePercent}%)</label><span>${formatMoney(tax)}</span></div>` : ""}
      ${po.shippingCost > 0 ? `<div class="row"><label>Shipping</label><span>${formatMoney(po.shippingCost)}</span></div>` : ""}
      <div class="row grand"><label>Grand Total</label><span>${formatMoney(grandTotal)}</span></div>
    </div>
    ${po.notes ? `<hr/><h2>Notes</h2><p>${po.notes}</p>` : ""}
  </body></html>`;

  openPrintWindow(html);
}

export function printWO(workOrder: WorkOrder): void {
  const { orgName, logoDataUrl } = useSettingsStore.getState();
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="${orgName}" style="max-height:48px;max-width:180px;object-fit:contain;display:block;margin-bottom:4px;" />`
    : "";
  const html = `<!DOCTYPE html><html><head><title>WO ${workOrder.workOrderNumber}</title><style>${PRINT_STYLES}</style></head><body>
    <div class="header-row">
      <div>
        <h1>Work Order</h1>
        <span class="badge">${workOrder.workOrderNumber}</span>
      </div>
      <div class="org">
        ${logoHtml}
        <strong>${orgName}</strong><br/>
        Created: ${formatDateStr(workOrder.createdAt)}<br/>
        Status: ${workOrder.status.replace(/_/g, " ")}
      </div>
    </div>
    <hr/>
    <h2>Details</h2>
    <dl class="meta">
      <dt>Title</dt><dd>${workOrder.title}</dd>
      <dt>Priority</dt><dd>${workOrder.priority}</dd>
      <dt>Status</dt><dd>${workOrder.status.replace(/_/g, " ")}</dd>
      ${workOrder.assetName ? `<dt>Asset</dt><dd>${workOrder.assetName}</dd>` : ""}
      ${workOrder.assignedToName ? `<dt>Assigned To</dt><dd>${workOrder.assignedToName}</dd>` : ""}
      ${workOrder.category ? `<dt>Category</dt><dd>${workOrder.category}</dd>` : ""}
      ${workOrder.dueDate ? `<dt>Due Date</dt><dd>${formatDateStr(workOrder.dueDate)}</dd>` : ""}
    </dl>
    ${workOrder.description ? `<hr/><h2>Description / Notes</h2><p>${workOrder.description}</p>` : ""}
  </body></html>`;

  openPrintWindow(html);
}
