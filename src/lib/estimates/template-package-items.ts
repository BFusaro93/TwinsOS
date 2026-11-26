import type { EstimateTemplateItem } from "@/types/crm-estimates";
import type { CRMPackage } from "@/types/crm-packages";

export interface TemplateLayout {
  /** Ordinary service lines, in template order, each with the sort_order it should land at. */
  plain: { item: EstimateTemplateItem; sortOrder: number }[];
  /** Package lines to add with the package-adding code, each with its starting sort_order. */
  packages: { item: EstimateTemplateItem; pkg: CRMPackage; startSortOrder: number }[];
  /** Package lines that can't be added (package deleted, deactivated, empty, or already there). */
  skipped: string[];
  /** The next free sort_order after everything this template adds. */
  nextSortOrder: number;
}

/**
 * Lays a template's items out on an estimate: in template order, with a package taking a
 * block of (1 header + one line per package step) sort positions so its section header and
 * visits stay together. `alreadyOnEstimate` holds package ids the estimate already carries
 * (a package can be on an estimate only once), which are skipped rather than duplicated.
 */
export function layoutTemplateItems(
  items: EstimateTemplateItem[],
  packages: CRMPackage[],
  base: number,
  alreadyOnEstimate: ReadonlySet<string> = new Set(),
): TemplateLayout {
  const layout: TemplateLayout = { plain: [], packages: [], skipped: [], nextSortOrder: base };
  const used = new Set(alreadyOnEstimate);
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!item.packageId) {
      layout.plain.push({ item, sortOrder: layout.nextSortOrder++ });
      continue;
    }
    const pkg = packages.find((p) => p.id === item.packageId);
    const steps = pkg?.services?.length ?? 0;
    if (!pkg || steps === 0 || used.has(pkg.id)) {
      layout.skipped.push(item.serviceName);
      continue;
    }
    used.add(pkg.id);
    layout.packages.push({ item, pkg, startSortOrder: layout.nextSortOrder });
    layout.nextSortOrder += 1 + steps;
  }
  return layout;
}

/** Toast text for package lines a template couldn't add. */
export function skippedPackagesMessage(names: string[]): string {
  return `Not added: ${names.join(", ")} — the package is inactive, empty or already on this estimate`;
}
