export interface ReportExportGroupedInput {
  grandTotal: string[];
  groups: { label: string; subtotal: string[]; rows: string[][] }[];
}

/** A cell's fill/text color in an export (`#rrggbb`). */
export interface ReportExportCellColor {
  bg: string;
  text: string;
  bold?: boolean;
}

export interface ReportExportSectionInput {
  heading: string;
  columns: string[];
  rows: string[][];
  /** Flat sections only — formatted totals row (see buildTotalsRow in
   *  src/lib/reports/export-rows.ts) appended after the data rows. */
  totals?: string[];
  /** When set, `rows` is ignored — the PDF renders a grand-total row up top,
   *  then each group's subtotal row immediately followed by its detail rows
   *  (matches the legacy SA layout), via buildGroupedPdfSection. */
  grouped?: ReportExportGroupedInput;
  /** Conditional-format / spectrum colors aligned to `rows` (null = none). */
  cellColors?: (ReportExportCellColor | null)[][];
}

export interface ReportExportChartInput {
  title: string;
  bars: { label: string; value: number; valueLabel: string }[];
}

async function fetchReportPdf(
  title: string,
  sections: ReportExportSectionInput[],
  charts?: ReportExportChartInput[]
): Promise<Blob> {
  const res = await fetch("/api/crm/reports/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, sections, charts }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "PDF export failed");
  }
  return res.blob();
}

/** Posts already-fetched report data to the export/pdf route and triggers a
 *  browser download of the resulting file. `charts` render as simple
 *  horizontal bar charts above the table sections, matching what's shown
 *  on screen. */
export async function exportReportPDF(
  title: string,
  sections: ReportExportSectionInput[],
  charts?: ReportExportChartInput[]
): Promise<void> {
  const blob = await fetchReportPdf(title, sections, charts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // The `download` attribute wins over the server's Content-Disposition
  // filename — a title containing "/" (e.g. a dashboard tab named
  // "Revenue/Q1") would otherwise produce a broken/odd filename.
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "").trim() || "report";
  a.download = `${safeTitle}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Builds the same PDF as exportReportPDF but opens the browser's print
 *  dialog on it instead of downloading. Printing the rendered PDF (rather
 *  than window.print() on the live page) means the output can't come out
 *  blank when the on-screen table is mid-refetch, and matches the PDF
 *  button exactly. The PDF is loaded in a hidden iframe and printed from
 *  there, so no pop-up is needed. */
export async function printReportPDF(
  title: string,
  sections: ReportExportSectionInput[],
  charts?: ReportExportChartInput[]
): Promise<void> {
  const blob = await fetchReportPdf(title, sections, charts);
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  iframe.src = url;
  const cleanup = () => {
    // Give the print dialog time to finish reading the document.
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Some browsers block printing a blob PDF in an iframe — open it in a
      // tab instead so the user can print from the PDF viewer.
      window.open(url, "_blank");
    }
    cleanup();
  };
  document.body.appendChild(iframe);
}
