"use client";

import { useDisplaySize } from "@/lib/hooks/use-display-size";

/** Applies the saved display size on a page that has no TopBar (the app
 *  home screen) — the AppearanceMenu does this everywhere else. */
export function DisplaySizeApplier() {
  useDisplaySize();
  return null;
}
