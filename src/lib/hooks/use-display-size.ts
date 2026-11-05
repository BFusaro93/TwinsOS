"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

/**
 * App-wide display size for desktop screens.
 *
 * The app is dense, and on a laptop most people ended up zooming the browser
 * out to 80% on every page. This does that for them: it sets `data-ui-scale`
 * on <html>, and globals.css shrinks the root font size (every Tailwind size
 * is rem-based, so the whole UI scales — unlike CSS `zoom`, nothing about
 * popovers, drag-and-drop or viewport heights changes). Only applies on a
 * desktop-sized screen with a mouse; phones and tablets are untouched, and
 * printing always uses 100%.
 *
 * Used by the AppearanceMenu in the TopBar, which every signed-in shell
 * renders, so the marketing site, login, customer portal and proposal pages
 * never get it.
 */
export type UiScale = "80" | "90" | "100";

/** What a user who has never chosen gets. */
export const DEFAULT_UI_SCALE: UiScale = "80";

export const UI_SCALE_OPTIONS: { value: UiScale; label: string }[] = [
  { value: "80", label: "80% — compact" },
  { value: "90", label: "90%" },
  { value: "100", label: "100% — default browser size" },
];

const STORAGE_KEY = "landscapt-ui-scale";

export function isUiScale(v: string | null | undefined): v is UiScale {
  return v === "80" || v === "90" || v === "100";
}

function readStored(): UiScale {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isUiScale(v) ? v : DEFAULT_UI_SCALE;
  } catch {
    return DEFAULT_UI_SCALE;
  }
}

/** Applies the saved display size to <html> for as long as the caller is
 *  mounted, and returns it with a setter that also saves the choice. */
export function useDisplaySize(): { scale: UiScale; setScale: (v: UiScale) => void } {
  const [scale, setScaleState] = useState<UiScale>(DEFAULT_UI_SCALE);

  // Before paint where possible, so a client-side navigation never flashes at
  // 100%. Removed on unmount so leaving the app shell restores the page.
  useLayoutEffect(() => {
    const stored = readStored();
    setScaleState(stored);
    document.documentElement.dataset.uiScale = stored;
    return () => {
      delete document.documentElement.dataset.uiScale;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.uiScale = scale;
  }, [scale]);

  const setScale = useCallback((v: UiScale) => {
    setScaleState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* storage blocked — applies for this session only */
    }
  }, []);

  return { scale, setScale };
}
