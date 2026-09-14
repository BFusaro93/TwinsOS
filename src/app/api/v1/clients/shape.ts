export const CLIENT_SELECT =
  "id, display_name, account_type, status, primary_phone, primary_email, billing_address, billing_city, billing_state, billing_zip, source, parent_client_id, created_at, updated_at";

export function shapeClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    displayName: row.display_name,
    accountType: row.account_type,
    status: row.status,
    primaryPhone: row.primary_phone,
    primaryEmail: row.primary_email,
    billingAddress: row.billing_address,
    billingCity: row.billing_city,
    billingState: row.billing_state,
    billingZip: row.billing_zip,
    source: row.source,
    parentClientId: row.parent_client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
