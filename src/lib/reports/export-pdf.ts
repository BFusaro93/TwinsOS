export interface ReportExportSectionInput {
  heading: string;
  columns: string[];
  rows: string[][];
}

export interface ReportExportChartInput {
  title: string;
  bars: { label: string; value: number; valueLabel: string }[];
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
  const res = await fetch("/api/crm/reports/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, sections, charts }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "PDF export failed");
  }
  const blob = await res.blob();
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
