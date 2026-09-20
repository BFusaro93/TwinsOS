export const PROJECT_SELECT =
  "id, name, client_id, customer_name, address, city, state, zip, status, start_date, end_date, total_cost, notes, original_contract_price, contract_price, estimated_cost_cents, labor_hours, budget_hours, labor_rate_cents, burdened_rate_cents, created_at, updated_at";

export function shapeProject(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    customerName: row.customer_name,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    totalCostCents: row.total_cost,
    notes: row.notes,
    contractPriceCents: row.original_contract_price,
    // Read-only: original_contract_price + approved change orders, computed
    // by a DB trigger. Never settable directly — see CLAUDE.md "Project
    // change orders".
    derivedContractPriceCents: row.contract_price,
    estimatedCostCents: row.estimated_cost_cents,
    laborHours: row.labor_hours,
    budgetHours: row.budget_hours,
    laborRateCents: row.labor_rate_cents,
    burdenedRateCents: row.burdened_rate_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
