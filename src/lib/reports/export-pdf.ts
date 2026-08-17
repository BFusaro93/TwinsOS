export interface ReportExportSectionInput {
  heading: string;
  columns: string[];
  rows: string[][];
}

/** Posts already-fetched report data to the export/pdf route and triggers a
 *  browser download of the resulting file. */
export async function exportReportPDF(
  title: string,
  sections: ReportExportSectionInput[]
): Promise<void> {
  const res = await fetch("/api/crm/reports/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, sections }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "PDF export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
