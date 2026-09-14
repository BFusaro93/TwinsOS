export const PART_SELECT =
  "id, name, part_number, description, category, quantity_on_hand, minimum_stock, unit_cost, vendor_id, vendor_name, is_inventory, created_at, updated_at";

export function shapePart(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    partNumber: row.part_number,
    description: row.description,
    category: row.category,
    quantityOnHand: row.quantity_on_hand,
    minimumStock: row.minimum_stock,
    unitCostCents: row.unit_cost,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    isInventory: row.is_inventory,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
