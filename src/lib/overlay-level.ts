import { createContext, useContext } from "react";

/**
 * Tracks the current overlay nesting depth.
 * Level 0 = first overlay (e.g. WO detail opened from an asset page).
 * Level 1 = second overlay opened from inside the first, etc.
 *
 * Components that render a portal overlay should:
 *   1. Read the current level with useOverlayLevel()
 *   2. Compute z-indexes with overlayZ(level)
 *   3. Show bg-black/80 backdrop only when level === 0
 *   4. Wrap their portal content in <OverlayLevelContext.Provider value={level + 1}>
 *
 * React portals maintain component-tree context, so the provider value flows
 * into the portal even though it renders elsewhere in the DOM.
 */
export const OverlayLevelContext = createContext(0);

export function useOverlayLevel() {
  return useContext(OverlayLevelContext);
}

/**
 * Returns backdrop and panel z-indexes for a given overlay depth level.
 * Levels are spaced by 20 to leave room for internal stacking within each overlay.
 *
 * Level 0: backdrop=199, panel=200
 * Level 1: backdrop=219, panel=220
 * Level 2: backdrop=239, panel=240
 * ...
 */
export function overlayZ(level: number): { backdrop: number; panel: number } {
  const base = 199 + level * 20;
  return { backdrop: base, panel: base + 1 };
}
