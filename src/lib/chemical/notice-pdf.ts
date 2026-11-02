import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { ChemicalNoticeDocument } from "@/components/crm/chemical/pdf/ChemicalNoticeDocument";
import type { ChemicalNoticeData, ChemicalNoticeOrg } from "@/lib/chemical/application-notice";

/** Renders the Notice of Treatment as a PDF buffer, for attaching to an email. */
export async function renderChemicalNoticePdf(
  data: ChemicalNoticeData,
  org: ChemicalNoticeOrg,
  timeZone?: string
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(createElement(ChemicalNoticeDocument as any, { data, org, timeZone }) as any);
  return buffer as unknown as Buffer;
}
