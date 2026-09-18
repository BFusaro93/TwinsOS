export const CONTRACT_SELECT =
  "id, client_id, estimate_id, title, status, start_date, end_date, monthly_amount_cents, billing_frequency, auto_renew, notes, signed_at, signed_by, billing_day_of_month, bill_month_in_advance, payment_type, po_number, auto_generate, is_active, include_sub_properties, source, sales_rep_id, last_billed_date, monthly_amounts, invoice_line_items, default_service, created_at, updated_at";

export function shapeContract(row: Record<string, unknown>) {
  return {
    id: row.id,
    clientId: row.client_id,
    estimateId: row.estimate_id,
    title: row.title,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyAmountCents: row.monthly_amount_cents,
    billingFrequency: row.billing_frequency,
    autoRenew: row.auto_renew,
    notes: row.notes,
    signedAt: row.signed_at,
    signedBy: row.signed_by,
    billingDayOfMonth: row.billing_day_of_month,
    billMonthInAdvance: row.bill_month_in_advance,
    paymentType: row.payment_type,
    poNumber: row.po_number,
    autoGenerate: row.auto_generate,
    isActive: row.is_active,
    includeSubProperties: row.include_sub_properties,
    source: row.source,
    salesRepId: row.sales_rep_id,
    lastBilledDate: row.last_billed_date,
    monthlyAmounts: row.monthly_amounts,
    invoiceLineItems: row.invoice_line_items,
    defaultService: row.default_service,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
