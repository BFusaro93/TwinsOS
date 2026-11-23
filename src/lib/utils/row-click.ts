import type { MouseEvent } from "react";

// Controls that handle their own clicks. A click that lands on (or inside) one
// of these must not also trigger the table row's "open this item" click.
const INTERACTIVE = 'a,button,input,select,textarea,label,[role]:not([role="cell"]):not([role="row"])';

/**
 * Put on a table cell that holds interactive controls (a client link, a
 * status button, an inline date picker) but should still open the row when the
 * empty space around them is clicked. Replaces a blanket
 * `onClick={(e) => e.stopPropagation()}` on the cell, which made the whole
 * cell dead. React events bubble through portals, so clicks inside a menu or
 * popover opened from the cell are caught here too.
 */
export function stopRowClickOnControls(e: MouseEvent<HTMLElement>): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest(INTERACTIVE) || e.currentTarget.contains(target) === false) e.stopPropagation();
}
