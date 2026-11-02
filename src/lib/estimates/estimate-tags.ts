/**
 * Estimate-only merge tags ([estimatelink], [estimategrid], [installmentamount], …) resolve only
 * when a document is sent from an estimate. Since estimate emails became "client" documents,
 * the same documents show up in ticket / bulk / client email pickers, where those tags would
 * send as blanks.
 */
const ESTIMATE_TAG_RE = /\[(estimate[a-z]*|installment(?:count|amount))\]/i;

/** True when any block (text, settings, button links) references an estimate-only tag. */
export function blocksUseEstimateTags(blocks: unknown): boolean {
  if (!blocks) return false;
  try {
    return ESTIMATE_TAG_RE.test(JSON.stringify(blocks));
  } catch {
    return false;
  }
}
