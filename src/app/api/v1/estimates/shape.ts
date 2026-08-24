export const ESTIMATE_SELECT =
  "id, estimate_number, client_id, description, stage, estimate_date, valid_until_date, subtotal_cents, discount_cents, tax_cents, total_cents, probability_bps, notes, created_at, updated_at";

export function shapeEstimate(row: Record<string, unknown>) {
  return {
    id: row.id,
    estimateNumber: row.estimate_number,
    clientId: row.client_id,
    description: row.description,
    stage: row.stage,
    estimateDate: row.estimate_date,
    validUntilDate: row.valid_until_date,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    probabilityBps: row.probability_bps,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const ESTIMATE_LINE_ITEM_SELECT =
  "id, service_id, service_name, status, qty, unit_type, rate_cents, visits, total_cents";

export function shapeEstimateLineItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    status: row.status,
    qty: row.qty,
    unitType: row.unit_type,
    rateCents: row.rate_cents,
    visits: row.visits,
    totalCents: row.total_cents,
  };
}
