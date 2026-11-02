import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useSettingsStore } from "@/stores/settings-store";
import { escapeHtml } from "@/lib/utils/escape-html";
import { openPrintWindow } from "@/lib/print";
import {
  loadChemicalNoticeData,
  loadInvoiceTemplateBranding,
  renderChemicalNoticeHtml,
  type ChemicalNoticeData,
  type ChemicalNoticeOrg,
} from "@/lib/chemical/application-notice";

/** The org branding the store already holds, in the shape the notice renderer wants. */
export function noticeOrgFromSettings(): ChemicalNoticeOrg {
  const { orgName, logoDataUrl, companyAddress, brandColor } = useSettingsStore.getState();
  const cityLine = [[companyAddress.city, companyAddress.state].filter(Boolean).join(", "), companyAddress.zip]
    .filter(Boolean)
    .join(" ");
  return {
    name: orgName || "Your Service Provider",
    phone: companyAddress.phone || null,
    addressLines: [companyAddress.street, cityLine].filter(Boolean),
    logoUrl: logoDataUrl,
    brandColor,
  };
}

const PAGE_STYLES = `
  @page { size: letter landscape; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  .cs-page { page-break-after: always; min-height: 7.4in; }
  .cs-page:last-child { page-break-after: auto; }
  .cs-crew { font-size: 12px; }
  .cs-client { width: 100%; }
  .cs-crew h1 { font-size: 15px; margin: 0 0 2px; }
  .cs-crew .cs-sub { color: #555; margin-bottom: 8px; }
  .cs-crew table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  .cs-crew th, .cs-crew td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  .cs-crew th { background: #f1f1f1; }
  .cs-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin-top: 10px; }
  .cs-fields div { border-bottom: 1px solid #444; padding-bottom: 2px; min-height: 22px; font-size: 11px; color: #444; }
  .cs-label { margin-top: 8px; font-size: 11px; border: 1px solid #bbb; padding: 6px; }
`;

function crewCopy(d: ChemicalNoticeData, dateLabel: string): string {
  const rows = d.products
    .map(
      (p) => `<tr>
        <td><strong>${escapeHtml(p.name)}</strong>${p.epaNumber ? `<br>EPA ${escapeHtml(p.epaNumber)}` : ""}</td>
        <td>${p.amount ? escapeHtml(p.amount) : "&mdash;"}${p.solutionAmount ? `<br>Solution ${escapeHtml(p.solutionAmount)}` : ""}</td>
        <td>${escapeHtml(p.method ?? "—")}</td>
        <td>${escapeHtml(p.targets ?? "—")}${p.areasTreated ? `<br><em>${escapeHtml(p.areasTreated)}</em>` : ""}</td>
      </tr>`
    )
    .join("");
  const labels = d.products
    .filter((p) => p.labelInstructions)
    .map((p) => `<div class="cs-label"><strong>${escapeHtml(p.name)} label:</strong> ${escapeHtml(p.labelInstructions as string).replace(/\n/g, "<br>")}</div>`)
    .join("");
  return `<div class="cs-crew">
    <h1>${escapeHtml(d.clientName)}</h1>
    <div class="cs-sub">${escapeHtml(d.addressLine || "No address on file")}<br>${escapeHtml(dateLabel)}${d.serviceName ? ` · ${escapeHtml(d.serviceName)}` : ""}</div>
    <strong>Crew copy — return to office</strong>
    <table>
      <tr><th>Product</th><th>Planned</th><th>Method</th><th>Target / Area</th></tr>
      ${rows}
    </table>
    <div class="cs-fields">
      <div>Applicator</div><div>License #</div>
      <div>Start time</div><div>End time</div>
      <div>Temp °F</div><div>Wind mph / dir</div>
      <div>Actual amount used</div><div>pH</div>
    </div>
    <div class="cs-fields" style="grid-template-columns:1fr;"><div>Notes</div><div>&nbsp;</div></div>
    ${labels}
  </div>`;
}

/** Strips what the crew hasn't done yet so the leave-behind prints as write-in blanks. */
function blankedForWriteIn(d: ChemicalNoticeData): ChemicalNoticeData {
  return {
    ...d,
    applicatorName: null,
    applicatorLicense: null,
    startTime: null,
    endTime: null,
    temperature: null,
    windSpeed: null,
    windDirection: null,
    phLevel: null,
    techNotes: null,
    products: d.products.map((p) => ({ ...p, amount: null, used: true })),
  };
}

/**
 * Prints two landscape pages per chemical stop: the crew's working copy, then a
 * full-width "Notice of Treatment" for the customer to be handed over or torn off. Stops
 * keep the order of `visitIds`. Visits with no chemicals are skipped.
 */
export async function printChemicalRouteSheets(params: { visitIds: string[]; dateLabel: string }): Promise<void> {
  const supabase = createClient();
  let notices: Map<string, ChemicalNoticeData>;
  try {
    notices = await loadChemicalNoticeData(supabase, params.visitIds, "planned");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Couldn't load chemical data for the route sheet.");
    return;
  }
  const ordered = params.visitIds.map((id) => notices.get(id)).filter((n): n is ChemicalNoticeData => !!n);
  if (ordered.length === 0) {
    toast.error("None of the selected visits have chemicals planned.");
    return;
  }
  const org = { ...noticeOrgFromSettings(), ...(await loadInvoiceTemplateBranding(supabase)) };
  const pages = ordered
    .map(
      (d) => `<div class="cs-page">${crewCopy(d, params.dateLabel)}</div>
      <div class="cs-page"><div class="cs-client">${renderChemicalNoticeHtml(blankedForWriteIn(d), org, { writeIn: true, maxWidth: "100%" })}</div></div>`
    )
    .join("");
  openPrintWindow(`<!DOCTYPE html><html><head><title>Chemical Route Sheets — ${escapeHtml(params.dateLabel)}</title><style>${PAGE_STYLES}</style></head><body>${pages}</body></html>`);
}

/** Prints the notice for ONE visit from what was actually recorded (the leave-behind
 *  after the fact, or a reprint for the customer). */
export async function printAppliedNotice(visitId: string): Promise<void> {
  const supabase = createClient();
  try {
    const notice = (await loadChemicalNoticeData(supabase, [visitId], "applied")).get(visitId);
    if (!notice) {
      toast.error("No confirmed chemical applications on this visit yet.");
      return;
    }
    const org = { ...noticeOrgFromSettings(), ...(await loadInvoiceTemplateBranding(supabase)) };
    const body = renderChemicalNoticeHtml(notice, org);
    openPrintWindow(`<!DOCTYPE html><html><head><title>Notice of Treatment</title><style>@page{size:letter;margin:0.5in}body{margin:0}</style></head><body>${body}</body></html>`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Couldn't build the notice.");
  }
}
