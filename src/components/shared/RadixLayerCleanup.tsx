"use client";

import { useEffect } from "react";

/**
 * Global safeguard against Radix layers that never finish closing.
 *
 * Radix's `Presence` keeps a closing Dialog / Sheet / DropdownMenu / Select
 * mounted (with `data-state="closed"`) until the CSS exit animation fires
 * `animationend`. While that layer is mounted, `DismissableLayer` keeps
 * `body { pointer-events: none }` — and a lingering overlay still covers the
 * page. Chrome pauses CSS animations in a hidden or occluded tab, so a dialog
 * closed right before (or while) the window is in the background never gets
 * its `animationend`: the layer stays mounted, the body stays inert, and the
 * first click after coming back to the tab is swallowed (D-24 — tabs/buttons
 * "ignoring the first click"). Reproduced on /crm/clients: More → Send Portal
 * Invite → Close, with the tab hidden, left `body.style.pointerEvents === "none"`
 * indefinitely; dispatching the missing `animationend` restored everything.
 *
 * This finishes any stalled exit animation (which lets Presence unmount and
 * Radix restore the body itself) when the tab becomes visible again and, as
 * a last resort, on the next pointerdown that finds the body inert with no
 * layer actually open. `components/ui` is off-limits, so this lives beside
 * the providers rather than inside the shadcn wrappers.
 */

const OPEN_LAYER_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

function hasOpenLayer(): boolean {
  return !!document.querySelector(OPEN_LAYER_SELECTOR);
}

/** Force-complete every Radix exit animation that is still pending. Returns how many it touched. */
function finishStalledExitAnimations(): number {
  let touched = 0;
  document.querySelectorAll<HTMLElement>('[data-state="closed"]').forEach((el) => {
    const animationName = getComputedStyle(el).animationName;
    if (!animationName || animationName === "none") return;
    touched++;
    const running = typeof el.getAnimations === "function" ? el.getAnimations() : [];
    if (running.length > 0) {
      running.forEach((a) => { try { a.finish(); } catch { /* already finished */ } });
    }
    // A hidden tab may never have created the Animation objects at all —
    // Presence only needs the event (it checks target === node and that the
    // name matches the element's current animation-name).
    el.dispatchEvent(new AnimationEvent("animationend", { animationName, bubbles: true }));
  });
  return touched;
}

function releaseInertBodyIfOrphaned() {
  if (document.body.style.pointerEvents !== "none" || hasOpenLayer()) return;
  finishStalledExitAnimations();
  // Presence unmounts on the next tick; if the body is still inert with no
  // open layer after that, nothing legitimate owns the lock any more.
  setTimeout(() => {
    if (document.body.style.pointerEvents === "none" && !hasOpenLayer()) {
      document.body.style.pointerEvents = "";
    }
  }, 50);
}

export function RadixLayerCleanup() {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Give the browser one frame to resume paused animations on its own,
      // then complete whatever is still stuck.
      requestAnimationFrame(() => releaseInertBodyIfOrphaned());
      setTimeout(releaseInertBodyIfOrphaned, 250);
    };
    const onPointerDown = () => releaseInertBodyIfOrphaned();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    // Capture phase: with the body inert the event targets <html>, so this
    // still fires and clears the lock for the next click.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
  return null;
}
