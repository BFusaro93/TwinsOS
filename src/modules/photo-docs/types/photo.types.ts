import type { BaseRecord } from "@/types/common";

// ── Enums / Unions ────────────────────────────────────────────────────────────

export type BeforeAfterFlag = "before" | "during" | "after" | "none";

export type UploadContext =
  | "site_documentation"
  | "progress"
  | "completion"
  | "other";

export const PHOTO_TAGS = [
  "Tree Removal", "Trimming", "Mulch", "Lawn",
  "Drainage", "Hardscape", "Cleanup", "Other",
] as const;
export type PhotoTag = (typeof PHOTO_TAGS)[number];

export type PhotoJobStatus = "active" | "complete" | "pending";

// ── Photo Job (photos module's own job record) ────────────────────────────────

export interface PhotoJob {
  id: string;
  orgId: string;
  name: string;
  customerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string | null;
  status: PhotoJobStatus;
  isArchived: boolean;
  /** Optional link to a Project for cost tracking. null = standalone photo job */
  projectId: string | null;
  /** Optional link to a CRM client. null = matched by customerName only */
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
}

// ── Core domain types ─────────────────────────────────────────────────────────

export interface JobPhoto extends BaseRecord {
  photoJobId: string;
  uploadedBy: string;
  uploadedByName: string;
  displayName: string | null;
  storagePath: string;
  annotatedPath: string | null;
  thumbnailPath: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  beforeAfter: BeforeAfterFlag;
  tags: string[];
  notes: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  uploadContext: UploadContext;
  hasAnnotations: boolean;
  // Derived at read time
  publicUrl?: string;
  annotatedUrl?: string;
}

/** An explicit before→after photo pairing, created by a user selecting exactly
 *  two photos. Replaces guessing pairs by tag + array index — a job can have
 *  several of these (e.g. "Front bed", "Retaining wall"). */
export interface PhotoComparison {
  id: string;
  orgId: string;
  photoJobId: string;
  beforePhotoId: string;
  afterPhotoId: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  // Derived at read time (joined photo rows)
  beforePhoto?: JobPhoto;
  afterPhoto?: JobPhoto;
}

export interface PhotoAnnotation {
  id: string;
  orgId: string;
  photoId: string;
  authorId: string;
  authorName: string;
  fabricJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── Input / form types ────────────────────────────────────────────────────────

export interface PhotoUploadInput {
  photoJobId: string;
  file: File;
  displayName?: string;
  beforeAfter: BeforeAfterFlag;
  tags: string[];
  notes?: string;
  uploadContext: UploadContext;
  gpsLat?: number;
  gpsLng?: number;
}

export interface PhotoUploadProgress {
  fileIndex: number;
  total: number;
  fileName: string;
  status: "compressing" | "uploading" | "saving" | "done" | "error";
  errorMessage?: string;
}

export type GalleryTab = "all" | "before" | "during" | "after" | "annotated";
export type GalleryFileType = "all" | "photos" | "videos" | "documents";

export type DrawTool = "select" | "arrow" | "circle" | "text" | "freehand";
export type DrawColor = "#ef4444" | "#facc15" | "#22c55e" | "#ffffff";

export const DRAW_COLORS: { label: string; value: DrawColor }[] = [
  { label: "Red",    value: "#ef4444" },
  { label: "Yellow", value: "#facc15" },
  { label: "Green",  value: "#22c55e" },
  { label: "White",  value: "#ffffff" },
];
