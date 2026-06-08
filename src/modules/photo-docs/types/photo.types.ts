import type { BaseRecord } from "@/types/common";

// ── Enums / Unions ────────────────────────────────────────────────────────────

export type BeforeAfterFlag = "before" | "after" | "none";

export type UploadContext =
  | "site_documentation"  // manager / sales — estimate / site visit
  | "progress"            // technician / crew — during work
  | "completion"          // technician / crew — finished work
  | "other";

export const PHOTO_TAGS = [
  "Tree Removal",
  "Trimming",
  "Mulch",
  "Lawn",
  "Drainage",
  "Hardscape",
  "Cleanup",
  "Other",
] as const;

export type PhotoTag = (typeof PHOTO_TAGS)[number];

// ── Core domain types ─────────────────────────────────────────────────────────

export interface JobPhoto extends BaseRecord {
  projectId: string;
  uploadedBy: string;
  uploadedByName: string;
  /** Path inside the job-photos-original Supabase Storage bucket */
  storagePath: string;
  /** Path inside job-photos-annotated bucket — null until first annotation is saved */
  annotatedPath: string | null;
  thumbnailPath: string | null;
  fileName: string;
  fileSize: number; // bytes
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
  // ─ Derived at read time (not stored) ─
  publicUrl?: string;
  annotatedUrl?: string;
}

export interface PhotoAnnotation {
  id: string;
  orgId: string;
  photoId: string;
  authorId: string;
  authorName: string;
  /** Full Fabric.js JSON canvas state */
  fabricJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── Input / form types ────────────────────────────────────────────────────────

export interface PhotoUploadInput {
  projectId: string;
  file: File;
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

// ── Gallery filter ─────────────────────────────────────────────────────────────

export type GalleryTab = "all" | "before" | "after" | "annotated";

// ── Annotation draw tool ──────────────────────────────────────────────────────

export type DrawTool = "select" | "arrow" | "circle" | "text" | "freehand";
export type DrawColor = "#ef4444" | "#facc15" | "#22c55e" | "#ffffff";

export const DRAW_COLORS: { label: string; value: DrawColor }[] = [
  { label: "Red",    value: "#ef4444" },
  { label: "Yellow", value: "#facc15" },
  { label: "Green",  value: "#22c55e" },
  { label: "White",  value: "#ffffff" },
];
