"use client";

import { createContext, createElement, useContext, useEffect, useRef, type ReactNode } from "react";
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

/**
 * True inside the slide-over drawer, false in the docked sidebar.
 *
 * `sidebarCollapsed` is one global flag, but it only means anything for the
 * DOCKED sidebar, where collapsing to the icon rail buys horizontal space for
 * the content sitting beside it. The drawer is an overlay — nothing sits
 * beside it, so there is nothing to buy, and the rail is pure loss.
 *
 * Sharing the flag meant a phone got the rail by default
 * (useSidebarRailDefault fires below 1280px, and a phone is well below it) and
 * could never get out of it: the collapse toggle in TopBar is `lg:inline-flex`,
 * so on a phone the hamburger opened a 260px panel containing a 64px strip of
 * unlabelled icons with no control anywhere to expand it.
 */
const SidebarDrawerContext = createContext(false);

/** Wrap the drawer's panel so the sidebar inside it always renders expanded. */
export function SidebarDrawerProvider({ children }: { children: ReactNode }) {
  return createElement(SidebarDrawerContext.Provider, { value: true }, children);
}

/**
 * Whether THIS sidebar instance should render as the icon rail. Every sidebar
 * reads collapse state through here rather than from the store directly, so a
 * sidebar placed in a drawer can never be collapsed into an unrecoverable
 * state.
 */
export function useSidebarCollapsed() {
  const inDrawer = useContext(SidebarDrawerContext);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  return inDrawer ? false : collapsed;
}
