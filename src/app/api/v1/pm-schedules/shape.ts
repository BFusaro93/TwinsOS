export const PM_SCHEDULE_SELECT =
  "id, title, asset_id, asset_name, frequency, next_due_date, last_completed_date, is_active, description, created_at, updated_at";

export function shapePmSchedule(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    assetId: row.asset_id,
    assetName: row.asset_name,
    frequency: row.frequency,
    nextDueDate: row.next_due_date,
    lastCompletedDate: row.last_completed_date,
    isActive: row.is_active,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
