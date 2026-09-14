export const REQUISITION_SELECT =
  "id, requisition_number, title, status, requested_by_name, vendor_id, vendor_name, subtotal, tax_rate_percent, sales_tax, shipping_cost, grand_total, notes, work_order_id, crm_job_id, created_at, updated_at";

export function shapeRequisition(row: Record<string, unknown>) {
  return {
    id: row.id,
    requisitionNumber: row.requisition_number,
    title: row.title,
    status: row.status,
    requestedByName: row.requested_by_name,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    subtotalCents: row.subtotal,
    taxRatePercent: row.tax_rate_percent,
    salesTaxCents: row.sales_tax,
    shippingCostCents: row.shipping_cost,
    grandTotalCents: row.grand_total,
    notes: row.notes,
    workOrderId: row.work_order_id,
    crmJobId: row.crm_job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const REQ_LINE_ITEM_SELECT =
  "id, product_item_id, product_item_name, part_number, quantity, unit_cost, total_cost, project_id, notes";

export function shapeRequisitionLineItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    productItemId: row.product_item_id,
    productItemName: row.product_item_name,
    partNumber: row.part_number,
    quantity: row.quantity,
    unitCostCents: Math.round(row.unit_cost as number),
    totalCostCents: row.total_cost,
    projectId: row.project_id,
    notes: row.notes,
  };
}
