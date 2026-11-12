/**
 * One place that loads pdf.js in the browser.
 *
 * Both PDF importers (the P&L parser and the AvB job-costing dashboard) used
 * to pull pdf.js from cdnjs at runtime — one of them a 3.x build with a known
 * arbitrary-JavaScript-on-open bug (CVE-2024-4367) — so whatever cdnjs served
 * ran with full access to a signed-in staff session. This loads the pinned,
 * bundled `pdfjs-dist` instead and serves its worker from our own origin (/public),
 * so no third-party host is in the loop. (pdf.js 6 dropped the
 * `isEvalSupported` switch — its font-program eval path is gone entirely.)
 */
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // Static copy in /public (see scripts/copy-pdf-worker.mjs) — bundling the
    // worker through webpack/SWC injects unresolvable @swc/helpers imports.
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjs;
}

/** Text of every page, as pdf.js text items (string + transform matrix). */
export async function openPdf(data: ArrayBuffer) {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ data }).promise;
}
