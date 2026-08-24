export interface PortalDocument {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  category: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPortalDocument(row: any): PortalDocument {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    description: row.description ?? null,
    category: row.category,
    storagePath: row.storage_path,
    fileName: row.file_name,
    sizeBytes: row.size_bytes ?? null,
    mimeType: row.mime_type ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
