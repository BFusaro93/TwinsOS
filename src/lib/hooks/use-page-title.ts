"use client";

import { useEffect } from "react";

interface TitledNavItem {
  href: string;
  label: string;
}

interface TitledNavSection {
  items: TitledNavItem[];
}

/**
 * Sets the browser tab title to "<current nav item's label> | <brand>",
 * driven by the same nav config used for sidebar active-link highlighting —
 * so the tab title can never drift out of sync with what the sidebar calls
 * a page. Falls back to just "<brand>" when the path matches no nav item
 * (e.g. a bare shell route, or a detail page one level past a listed item).
 */
export function usePageTitle(pathname: string, sections: TitledNavSection[], brand: string): void {
  useEffect(() => {
    const items = sections.flatMap((s) => s.items);
    let best: TitledNavItem | null = null;
    for (const item of items) {
      const href = item.href.split("?")[0];
      const matches = pathname === href || pathname.startsWith(href + "/");
      if (matches && (!best || href.length > best.href.length)) best = item;
    }
    document.title = best ? `${best.label} | ${brand}` : brand;
  }, [pathname, sections, brand]);
}
