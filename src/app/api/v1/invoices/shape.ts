export const INVOICE_SELECT =
  "id, invoice_number, client_id, description, status, invoice_date, due_date, po_number, subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, balance_cents, notes, created_at, updated_at";

export function shapeInvoice(row: Record<string, unknown>) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    clientId: row.client_id,
    description: row.description,
    status: row.status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    poNumber: row.po_number,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    amountPaidCents: row.amount_paid_cents,
    balanceCents: row.balance_cents,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const INVOICE_LINE_ITEM_SELECT = "id, description, qty, rate_cents, total_cents, sort_order";

export function shapeInvoiceLineItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    description: row.description,
    qty: row.qty,
    rateCents: row.rate_cents,
    totalCents: row.total_cents,
    sortOrder: row.sort_order,
  };
}
