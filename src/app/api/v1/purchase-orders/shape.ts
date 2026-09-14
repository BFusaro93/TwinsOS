export const PURCHASE_ORDER_SELECT =
  "id, po_number, po_date, invoice_number, status, vendor_id, vendor_name, subtotal, tax_rate_percent, sales_tax, shipping_cost, grand_total, requisition_id, notes, created_at, updated_at";

export function shapePurchaseOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    poNumber: row.po_number,
    poDate: row.po_date,
    invoiceNumber: row.invoice_number,
    status: row.status,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    subtotalCents: row.subtotal,
    taxRatePercent: row.tax_rate_percent,
    salesTaxCents: row.sales_tax,
    shippingCostCents: row.shipping_cost,
    grandTotalCents: row.grand_total,
    requisitionId: row.requisition_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const PO_LINE_ITEM_SELECT =
  "id, product_item_id, product_item_name, part_number, quantity, unit_cost, total_cost, project_id, notes";

export function shapePoLineItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    productItemId: row.product_item_id,
    productItemName: row.product_item_name,
    partNumber: row.part_number,
    quantity: row.quantity,
    unitCostCents: row.unit_cost,
    totalCostCents: row.total_cost,
    projectId: row.project_id,
    notes: row.notes,
  };
}
