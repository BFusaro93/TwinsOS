export const ASSET_SELECT =
  "id, name, asset_tag, equipment_number, asset_type, status, make, model, year, serial_number, division, location, notes, created_at, updated_at";

export function shapeAsset(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    assetTag: row.asset_tag,
    equipmentNumber: row.equipment_number,
    assetType: row.asset_type,
    status: row.status,
    make: row.make,
    model: row.model,
    year: row.year,
    serialNumber: row.serial_number,
    division: row.division,
    location: row.location,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
