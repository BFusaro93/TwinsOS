// Controls what a client sees on an estimate — the public proposal link, the
// client portal, and the generated PDF all read the same settings so a
// toggle change is consistent everywhere the client can view the estimate.

export interface DisplaySettings {
  showQuantities: boolean;
  showLinePrices: boolean;
  showLineTotals: boolean;
  showSectionSubtotals: boolean;
  hideZeroTotals: boolean;
  hideZeroPrices: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showQuantities: true,
  showLinePrices: true,
  showLineTotals: true,
  showSectionSubtotals: true,
  hideZeroTotals: false,
  hideZeroPrices: false,
};

export function toDisplaySettings(raw: unknown): DisplaySettings {
  const r = (raw as Partial<DisplaySettings>) ?? {};
  return { ...DEFAULT_DISPLAY_SETTINGS, ...r };
}

/**
 * Org-wide fallback for a brand-new estimate with no template selected — set
 * on the Settings > Estimates > Client View tab, stored the same way as
 * other soft settings (organizations.customizations jsonb, no migration).
 */
export function getOrgDefaultDisplaySettings(customizations: Record<string, unknown> | null | undefined): DisplaySettings {
  return toDisplaySettings(customizations?.defaultDisplaySettings);
}

interface GroupableItem {
  rowType?: "item" | "section" | null;
  sectionName?: string | null;
  totalCents: number;
}

export interface DisplaySection<T> {
  /** null = items that appear before any section header (or when there are no sections at all) */
  sectionName: string | null;
  items: T[];
  subtotalCents: number;
}

/**
 * Splits a flat, sort_order-sorted line item list into sections based on
 * row_type === 'section' marker rows, dropping those marker rows from the
 * output (they become the section's `sectionName`, not an item). Applies
 * `hideZeroTotals` by excluding zero-total item rows from their section
 * entirely, since that toggle hides the row, not just a field on it.
 */
export function groupIntoSections<T extends GroupableItem>(
  items: T[],
  settings: DisplaySettings
): DisplaySection<T>[] {
  const sections: DisplaySection<T>[] = [];
  let current: DisplaySection<T> = { sectionName: null, items: [], subtotalCents: 0 };
  let started = false;

  for (const item of items) {
    if (item.rowType === "section") {
      sections.push(current);
      current = { sectionName: item.sectionName ?? null, items: [], subtotalCents: 0 };
      started = true;
      continue;
    }
    if (settings.hideZeroTotals && item.totalCents === 0) continue;
    current.items.push(item);
    current.subtotalCents += item.totalCents;
    started = true;
  }
  sections.push(current);

  return started ? sections.filter((s) => s.items.length > 0 || s.sectionName !== null) : sections;
}
