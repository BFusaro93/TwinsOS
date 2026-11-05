/**
 * Opening a link that has to be fetched first (a signed storage URL). iPhone/iPad Safari blocks
 * a window.open that runs after an await, because it is no longer part of the tap, so open a
 * blank tab synchronously in the click handler and point it at the URL once it arrives.
 */

/** A blank tab opened inside a click handler. Null when the browser refused it anyway. */
export function openPendingTab(): Window | null {
  const tab = window.open("", "_blank");
  // No opener link back to this page, the same protection "noopener" gave.
  if (tab) tab.opener = null;
  return tab;
}

/** Point a tab from openPendingTab at `url`; falls back to a normal open if none was created. */
export function showInPendingTab(tab: Window | null, url: string): void {
  if (tab && !tab.closed) tab.location.href = url;
  else window.open(url, "_blank", "noopener");
}
