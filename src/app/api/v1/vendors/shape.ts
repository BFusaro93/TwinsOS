export const VENDOR_SELECT =
  "id, name, contact_name, email, phone, address, website, notes, vendor_type, is_active, w9_status, created_at, updated_at";

export function shapeVendor(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    website: row.website,
    notes: row.notes,
    vendorType: row.vendor_type,
    isActive: row.is_active,
    w9Status: row.w9_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
