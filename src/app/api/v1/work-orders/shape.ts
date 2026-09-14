export const WORK_ORDER_SELECT =
  "id, work_order_number, title, description, status, priority, wo_type, asset_id, asset_name, assigned_to_id, assigned_to_name, due_date, category, created_at, updated_at";

export function shapeWorkOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    workOrderNumber: row.work_order_number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    woType: row.wo_type,
    assetId: row.asset_id,
    assetName: row.asset_name,
    assignedToId: row.assigned_to_id,
    assignedToName: row.assigned_to_name,
    dueDate: row.due_date,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
