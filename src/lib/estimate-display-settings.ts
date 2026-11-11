// Controls what a client sees on an estimate — the public proposal link, the
// client portal, and the generated PDF all read the same settings so a
// toggle change is consistent everywhere the client can view the estimate.

export interface DisplaySettings {
  showVisits: boolean;
  /** The quantity only (e.g. "1", "12 cu yd"). Visits and unit have their own toggles. */
  showQuantities: boolean;
  showUnits: boolean;
  showLinePrices: boolean;
  showLineTotals: boolean;
  showSectionSubtotals: boolean;
  hideZeroTotals: boolean;
  hideZeroPrices: boolean;
  /** A package prints as one main line (name, description, total); this also lists its visits under it. */
  showPackageVisits: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showVisits: true,
  showQuantities: true,
  showUnits: true,
  showLinePrices: true,
  showLineTotals: true,
  showSectionSubtotals: true,
  hideZeroTotals: false,
  hideZeroPrices: false,
  showPackageVisits: false,
};

export function toDisplaySettings(raw: unknown): DisplaySettings {
  const r = (raw as Partial<DisplaySettings>) ?? {};
  // showQuantities used to gate visits + qty + unit together. Settings saved
  // before the split carry only that key, so it seeds the two new toggles —
  // an estimate that hid quantities keeps hiding visits and unit too.
  const legacy = typeof r.showQuantities === "boolean" ? r.showQuantities : undefined;
  return {
    ...DEFAULT_DISPLAY_SETTINGS,
    ...(legacy === undefined ? {} : { showVisits: legacy, showUnits: legacy }),
    ...r,
  };
}

export function displaySettingsEqual(a: DisplaySettings, b: DisplaySettings): boolean {
  return (Object.keys(DEFAULT_DISPLAY_SETTINGS) as (keyof DisplaySettings)[]).every((k) => a[k] === b[k]);
}

/**
 * True when an estimate's toggles were changed by hand: they differ from what was
 * last copied onto it (the baseline). Estimates that predate the baseline are
 * compared with what they were created from — the org's default toggles (pass
 * them), else the built-in defaults — so an org whose default hides line prices
 * isn't asked "Replace the toggles?" on every old estimate.
 */
export function hasHandSetDisplaySettings(
  current: DisplaySettings,
  baseline: DisplaySettings | null | undefined,
  orgDefault?: DisplaySettings | null,
): boolean {
  if (baseline) return !displaySettingsEqual(current, baseline);
  if (displaySettingsEqual(current, DEFAULT_DISPLAY_SETTINGS)) return false;
  return orgDefault ? !displaySettingsEqual(current, orgDefault) : true;
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
  /** On a section marker row: the package wording (estimate_desc). */
  estimateDesc?: string | null;
  /** Set on a package's section marker row and on each of its lines. */
  packageId?: string | null;
  totalCents: number;
  /** Priced sub-items on the line (printed or not). A $0 line that carries them still has a price. */
  subitemTotalCents?: number | null;
  subitems?: unknown[] | null;
}

export interface DisplaySection<T> {
  /** null = items that appear before any section header (or when there are no sections at all) */
  sectionName: string | null;
  /** Set when the section is an Add Package group (its marker row carries the package id). */
  packageId?: string | null;
  /** The package's client-facing wording. */
  description?: string | null;
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
      current = {
        sectionName: item.sectionName ?? null,
        packageId: item.packageId ?? null,
        description: item.packageId ? (item.estimateDesc ?? null) : null,
        items: [],
        subtotalCents: 0,
      };
      started = true;
      continue;
    }
    // A package section holds only the lines tagged with its package: a line added
    // after "Add Package" starts a plain section of its own instead of being priced,
    // accepted and printed as part of the package.
    if (current.packageId && (item.packageId ?? null) !== current.packageId) {
      sections.push(current);
      current = { sectionName: null, items: [], subtotalCents: 0 };
    }
    // A line priced entirely through its sub-items has a $0 own total but is not a zero-price row:
    // hiding it dropped the line (and its printed sub-items) from the client's copy.
    const carriesSubitems = (item.subitemTotalCents ?? 0) > 0 || (item.subitems?.length ?? 0) > 0;
    if (settings.hideZeroTotals && item.totalCents === 0 && !carriesSubitems) continue;
    current.items.push(item);
    current.subtotalCents += item.totalCents;
    started = true;
  }
  sections.push(current);

  // A plain section header may stand alone (a heading), but a package with no visits left
  // has nothing to sell and must not print its name, wording and a $0.00 subtotal.
  return started ? sections.filter((s) => s.items.length > 0 || (s.sectionName !== null && !s.packageId)) : sections;
}
