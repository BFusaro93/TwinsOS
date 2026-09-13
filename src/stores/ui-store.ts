"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

/** Width below which a docked 260px sidebar crowds the content beside it.
 *  Landscape tablets (1024–1279) sit here, so they start on the icon rail. */
const RAIL_BY_DEFAULT_BELOW = 1280;

/**
 * Starts the docked sidebar collapsed to its icon rail on narrow viewports
 * (landscape tablets, small laptop windows). Runs once on mount only — after
 * that the toggle is the user's, and resizing never overrides their choice.
 * Call this once per shell; TopBar does it for all of them.
 */
export function useSidebarRailDefault() {
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (window.innerWidth < RAIL_BY_DEFAULT_BELOW) setSidebarCollapsed(true);
  }, [setSidebarCollapsed]);
}
