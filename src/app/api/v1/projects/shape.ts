export const PROJECT_SELECT =
  "id, name, customer_name, address, status, start_date, end_date, total_cost, notes, created_at, updated_at";

export function shapeProject(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    customerName: row.customer_name,
    address: row.address,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    totalCostCents: row.total_cost,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
