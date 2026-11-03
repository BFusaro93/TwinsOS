export type ReferenceCategory = "sds" | "label" | "sop" | "training" | "equipment" | "other";

export const REFERENCE_CATEGORIES: { value: ReferenceCategory; label: string }[] = [
  { value: "sds", label: "Safety Data Sheet" },
  { value: "label", label: "Product label" },
  { value: "sop", label: "SOP" },
  { value: "training", label: "Training" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

export function referenceCategoryLabel(category: ReferenceCategory): string {
  return REFERENCE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export interface ReferenceDocument {
  id: string;
  category: ReferenceCategory;
  title: string;
  description: string | null;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  revisionDate: string | null;
  productIds: string[];
  visibleToCrew: boolean;
  createdAt: string;
}
