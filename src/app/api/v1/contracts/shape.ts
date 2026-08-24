export const CONTRACT_SELECT =
  "id, client_id, estimate_id, title, status, start_date, end_date, monthly_amount_cents, billing_frequency, auto_renew, notes, signed_at, signed_by, created_at, updated_at";

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
