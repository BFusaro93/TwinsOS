export const PRODUCT_SELECT =
  "id, name, description, part_number, category, unit_cost, price, vendor_id, vendor_name, is_inventory, quantity_on_hand, created_at, updated_at";

export function shapeProduct(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    partNumber: row.part_number,
    category: row.category,
    unitCostCents: row.unit_cost,
    priceCents: row.price,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    isInventory: row.is_inventory,
    quantityOnHand: row.quantity_on_hand,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
