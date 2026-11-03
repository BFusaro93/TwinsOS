import { escapeHtml } from "@/lib/utils/escape-html";
import { notesToPlainText } from "@/lib/utils/rich-notes";
import { embeddedOne, resolveStopAddress } from "@/lib/utils/stop-address";

/**
 * The leave-behind "Notice of Treatment" — what the paper carbon copy used to
 * be. One builder feeds every surface: the printed chemical route sheet, the
 * Print Notice button on the application panel, the Email Notice dialog, and
 * the [chemicalnotice] merge tag for automations (so contract clients, who get
 * no invoice, still receive the record on completion). Inline styles only —
 * the same HTML has to survive an email client.
 */

export interface ChemicalNoticeProduct {
  name: string;
  epaNumber: string | null;
  /** "1.5 Gallons"; null when nothing is recorded or planned yet. */
  amount: string | null;
  solutionAmount: string | null;
  method: string | null;
  /** Application ratio, e.g. "2 gal per 1,000 sq ft". */
  rate: string | null;
  targets: string | null;
  areasTreated: string | null;
  reEntryInterval: string | null;
  /** Client-facing care text from the product's route-sheet instructions. */
  careInstructions: string | null;
  /** Crew-facing label text; only the crew copy of the route sheet shows it. */
  labelInstructions: string | null;
  used: boolean;
}

export interface ChemicalNoticeData {
  visitId: string;
  serviceDate: string | null;
  serviceName: string | null;
  clientName: string;
  clientFirstName: string;
  clientEmail: string | null;
  addressLine: string;
  applicatorName: string | null;
  applicatorLicense: string | null;
  startTime: string | null;
  endTime: string | null;
  temperature: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  phLevel: number | null;
  /** The technician's completion note for the visit (plain text), if any. */
  techNotes: string | null;
  products: ChemicalNoticeProduct[];
}

export interface ChemicalNoticeOrg {
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  addressLines?: string[];
  logoUrl?: string | null;
  brandColor?: string | null;
  /** Mirrors the invoice template's "include technician notes" setting. */
  showTechNotes?: boolean;
}

/** "applied" = what the record says was put down (used, and crew-confirmed when
 *  the row was only preloaded from the plan). "planned" = every preloaded row,
 *  for the printed route sheet that goes out before the work. */
export type ChemicalNoticeMode = "applied" | "planned";

type AppRow = {
  visit_id: string;
  chemical_amount: number | null;
  solution_amount: number | null;
  unit_of_measure_id: string | null;
  target_ids: string[] | null;
  areas_treated_ids: string[] | null;
  application_method_id: string | null;
  application_rate_label: string | null;
  epa_number_snapshot: string | null;
  re_entry_interval_snapshot: string | null;
  applicator_employee_id: string | null;
  applicator_license_number: string | null;
  application_start_time: string | null;
  application_end_time: string | null;
  temperature: number | null;
  wind_speed: number | null;
  wind_direction: string | null;
  ph_level: number | null;
  used: boolean;
  preloaded: boolean;
  confirmed_at: string | null;
  product_id: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  epa_registration_number: string | null;
  re_entry_interval: string | null;
  route_sheet_instructions: string | null;
  label_instructions: string | null;
};

type VisitRow = {
  id: string;
  scheduled_date: string | null;
  completion_notes?: string | null;
  job?: unknown;
  clients?: unknown;
  crm_job_services?: unknown;
};

function joinAmount(amount: number | null, unit: string | null): string | null {
  if (amount == null) return null;
  return [String(Number(amount)), unit].filter(Boolean).join(" ");
}

/** Loads the notice data for a set of visits in four queries, regardless of how
 *  many visits there are. Visits with no qualifying chemical rows are omitted.
 *  RLS scopes every table; pass `orgId` when calling with a service-role client. */
export async function loadChemicalNoticeData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  visitIds: string[],
  mode: ChemicalNoticeMode,
  orgId?: string
): Promise<Map<string, ChemicalNoticeData>> {
  const result = new Map<string, ChemicalNoticeData>();
  const ids = [...new Set(visitIds.filter(Boolean))];
  if (ids.length === 0) return result;

  let appsQuery = supabase
    .from("crm_chemical_applications")
    .select(
      "visit_id, chemical_amount, solution_amount, unit_of_measure_id, target_ids, areas_treated_ids, application_method_id, application_rate_label, epa_number_snapshot, re_entry_interval_snapshot, applicator_employee_id, applicator_license_number, application_start_time, application_end_time, temperature, wind_speed, wind_direction, ph_level, used, preloaded, confirmed_at, product_id"
    )
    .in("visit_id", ids)
    .is("deleted_at", null);
  if (orgId) appsQuery = appsQuery.eq("org_id", orgId);
  const { data: apps, error } = await appsQuery;
  if (error) throw new Error(error.message);

  const rows = ((apps ?? []) as AppRow[]).filter((a) =>
    mode === "planned" ? true : a.used && (!a.preloaded || a.confirmed_at != null)
  );
  if (rows.length === 0) return result;

  const lookupIds = [
    ...new Set(
      rows
        .flatMap((a) => [a.unit_of_measure_id, a.application_method_id, ...(a.target_ids ?? []), ...(a.areas_treated_ids ?? [])])
        .filter(Boolean)
    ),
  ] as string[];
  const productIds = [...new Set(rows.map((a) => a.product_id).filter(Boolean))] as string[];
  const employeeIds = [...new Set(rows.map((a) => a.applicator_employee_id).filter(Boolean))] as string[];
  const withOrg = <T extends { eq: (c: string, v: string) => T }>(q: T): T => (orgId ? q.eq("org_id", orgId) : q);

  const [lookups, products, employees, visits] = await Promise.all([
    lookupIds.length
      ? withOrg(supabase.from("crm_chemical_lookup_items").select("id, name").in("id", lookupIds))
      : { data: [] },
    productIds.length
      ? withOrg(
          supabase
            .from("product_items")
            .select("id, name, epa_registration_number, re_entry_interval, route_sheet_instructions, label_instructions")
            .in("id", productIds)
        )
      : { data: [] },
    employeeIds.length
      ? withOrg(supabase.from("crm_employees").select("id, first_name, last_name").in("id", employeeIds))
      : { data: [] },
    withOrg(
      supabase
        .from("crm_job_visits")
        .select(
          "id, scheduled_date, completion_notes, crm_job_services(service_name), job:crm_jobs(service_address, service_city, service_state, service_zip, property:client_properties(address, city, state, zip)), clients(display_name, primary_email, service_address, service_city, service_state, service_zip, billing_address, billing_city, billing_state, billing_zip)"
        )
        .in("id", ids)
    ),
  ]);

  const lookupName = new Map<string, string>(
    ((lookups.data ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])
  );
  const productById = new Map<string, ProductRow>(((products.data ?? []) as ProductRow[]).map((p) => [p.id, p]));
  const employeeName = new Map<string, string>(
    ((employees.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((e) => [
      e.id,
      [e.first_name, e.last_name].filter(Boolean).join(" "),
    ])
  );
  const names = (list: string[] | null) =>
    (list ?? [])
      .map((i) => lookupName.get(i))
      .filter(Boolean)
      .sort()
      .join(", ") || null;

  const byVisit = new Map<string, AppRow[]>();
  for (const r of rows) byVisit.set(r.visit_id, [...(byVisit.get(r.visit_id) ?? []), r]);

  for (const v of (visits.data ?? []) as VisitRow[]) {
    const vRows = byVisit.get(v.id);
    if (!vRows) continue;
    type Row = Record<string, string | null>;
    const jobEmbed = embeddedOne<{ property?: unknown } & Record<string, unknown>>(v.job as ({ property?: unknown } & Record<string, unknown>) | null);
    const job = jobEmbed as Row | null;
    const property = embeddedOne<Row>((jobEmbed?.property ?? null) as Row | null);
    const client = embeddedOne<Row>(v.clients as Row | null);
    const addr = resolveStopAddress({ job, property, client });
    const addressLine = addr
      ? [addr.parts.address, [addr.parts.city, addr.parts.state].filter(Boolean).join(", "), addr.parts.zip]
          .filter(Boolean)
          .join(" ")
      : "";
    const first = vRows.find((r) => r.applicator_employee_id || r.applicator_license_number) ?? vRows[0];
    const clientName = client?.display_name ?? "";
    const conds = vRows.find((r) => r.temperature != null || r.wind_speed != null || r.wind_direction) ?? vRows[0];
    const times = vRows.find((r) => r.application_start_time) ?? vRows[0];

    result.set(v.id, {
      visitId: v.id,
      serviceDate: v.scheduled_date,
      serviceName: embeddedOne<{ service_name: string | null }>(v.crm_job_services as { service_name: string | null } | null)?.service_name ?? null,
      clientName,
      clientFirstName: clientName.split(" ")[0] ?? clientName,
      clientEmail: client?.primary_email ?? null,
      addressLine,
      applicatorName: first.applicator_employee_id ? employeeName.get(first.applicator_employee_id) || null : null,
      applicatorLicense: first.applicator_license_number,
      startTime: times.application_start_time,
      endTime: times.application_end_time,
      temperature: conds.temperature,
      windSpeed: conds.wind_speed,
      windDirection: conds.wind_direction,
      phLevel: conds.ph_level,
      techNotes: notesToPlainText(v.completion_notes ?? null).trim() || null,
      products: vRows.map((a) => {
        const p = a.product_id ? productById.get(a.product_id) : undefined;
        return {
          name: p?.name ?? "Chemical",
          // The snapshot frozen at application time wins over the live catalog:
          // a later EPA # correction must not rewrite what the client was told.
          epaNumber: a.epa_number_snapshot || p?.epa_registration_number || null,
          amount: joinAmount(a.chemical_amount, a.unit_of_measure_id ? lookupName.get(a.unit_of_measure_id) ?? null : null),
          solutionAmount: a.solution_amount != null ? String(Number(a.solution_amount)) : null,
          method: a.application_method_id ? lookupName.get(a.application_method_id) ?? null : null,
          rate: a.application_rate_label || null,
          targets: names(a.target_ids),
          areasTreated: names(a.areas_treated_ids),
          reEntryInterval: a.re_entry_interval_snapshot || p?.re_entry_interval || null,
          careInstructions: p?.route_sheet_instructions?.trim() || null,
          labelInstructions: p?.label_instructions?.trim() || null,
          used: a.used,
        };
      }),
    });
  }
  return result;
}

function formatDate(ymd: string | null): string {
  if (!ymd) return "";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** The notice's Date: the day the application started (company timezone), which is what
 *  the Time beside it and the email's [applicationdate] report — the scheduled day only
 *  when no start time was recorded. A visit worked a day late used to read the planned day. */
export function chemicalNoticeDateText(d: Pick<ChemicalNoticeData, "startTime" | "serviceDate">, timeZone?: string): string {
  if (d.startTime) {
    const t = new Date(d.startTime);
    if (!Number.isNaN(t.getTime())) {
      return t.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", ...(timeZone ? { timeZone } : {}) });
    }
  }
  return formatDate(d.serviceDate);
}

function formatTime(iso: string | null, timeZone?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

export function chemicalConditionsText(d: ChemicalNoticeData): string {
  const parts: string[] = [];
  if (d.temperature != null) parts.push(`${d.temperature}°F`);
  if (d.windSpeed != null) parts.push(`wind ${d.windSpeed} mph${d.windDirection ? ` ${d.windDirection}` : ""}`);
  if (d.phLevel != null) parts.push(`pH ${d.phLevel}`);
  return parts.join(", ");
}

/** De-duplicated care text across the products on the visit, as HTML. */
export function chemicalCareHtml(d: ChemicalNoticeData): string {
  const unique = [...new Set(d.products.filter((p) => p.used).map((p) => p.careInstructions).filter((s): s is string => !!s))];
  return unique.map((s) => escapeHtml(s).replace(/\n/g, "<br>")).join("<br><br>");
}

const BLANK = `<span style="display:inline-block;min-width:70px;border-bottom:1px solid #444;">&nbsp;</span>`;

export interface RenderNoticeOptions {
  /** Leave-behind copy handed over before the work is recorded: amount/weather/time
   *  render as write-in blanks instead of "—". */
  writeIn?: boolean;
  /** IANA zone for formatting application times. */
  timeZone?: string;
  /** Smaller type and tighter rows, for the half-page tear-off. Standalone notices (email, print) are roomier. */
  compact?: boolean;
  /** CSS max-width of the notice; defaults to 760px. */
  maxWidth?: string;
  /** Replaces the default closing line. */
  footerNote?: string;
}

export function renderChemicalNoticeHtml(d: ChemicalNoticeData, org: ChemicalNoticeOrg, opts: RenderNoticeOptions = {}): string {
  // Styled to match the "Chemical Application Record" page on invoices, and built
  // entirely from the org's own branding and the visit's recorded data.
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(org.brandColor ?? "") ? (org.brandColor as string) : "#0f172a";
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const roomy = !opts.compact;
  const fs = roomy ? 13 : 11;
  const tint = /^#[0-9a-fA-F]{6}$/.test(accent) ? `${accent}1f` : "#f1f5f9";
  const cell = `${font}border-bottom:1px solid #e2e8f0;padding:${roomy ? 11 : 6}px 6px;font-size:${fs}px;vertical-align:top;color:#1e293b;`;
  const th = `${font}background:${tint};border-bottom:2px solid ${accent};padding:${roomy ? 9 : 5}px 6px;font-size:${roomy ? 11 : 10}px;font-weight:bold;text-align:left;color:#0f172a;`;
  const value = (s: string | null | undefined) => (s ? escapeHtml(s) : opts.writeIn ? BLANK : "&mdash;");

  const logo = org.logoUrl
    ? `<img src="${escapeHtml(org.logoUrl)}" alt="${escapeHtml(org.name)}" style="max-height:56px;max-width:180px;display:block;" />`
    : `<div style="${font}font-size:18px;font-weight:bold;color:${accent};">${escapeHtml(org.name)}</div>`;
  const contact = [...(org.addressLines ?? []), org.phone ?? "", org.website ?? "", org.email ?? ""]
    .filter(Boolean)
    .map((l) => escapeHtml(l))
    .join("<br>");

  const applied = d.products.filter((p) => p.used);
  const productRows = applied
    .map(
      (p) => `<tr>
        <td style="${cell}">${escapeHtml(p.name)}${p.epaNumber ? `<div style="font-size:10px;color:#64748b;">EPA ${escapeHtml(p.epaNumber)}</div>` : opts.writeIn ? `<div style="font-size:10px;color:#64748b;">EPA ${BLANK}</div>` : ""}</td>
        <td style="${cell}">${value(p.targets)}</td>
        <td style="${cell}">${value(p.areasTreated)}</td>
        <td style="${cell}">${value(p.rate)}</td>
        <td style="${cell}">${p.amount ? escapeHtml(p.amount) : opts.writeIn ? BLANK : "&mdash;"}</td>
        <td style="${cell}">${value(p.method)}</td>
        <td style="${cell}">${value(p.reEntryInterval)}</td>
      </tr>`
    )
    .join("");

  const conditions = chemicalConditionsText(d);
  const timeRange = [formatTime(d.startTime, opts.timeZone), formatTime(d.endTime, opts.timeZone)].filter(Boolean).join(" – ");
  const meta = (label: string, v: string, blank: string) =>
    `<td style="${font}font-size:${fs}px;padding:2px 18px 6px 0;vertical-align:top;"><span style="color:#64748b;">${label}</span><br><strong>${v ? escapeHtml(v) : opts.writeIn ? blank : "&mdash;"}</strong></td>`;

  // Each product's own Client Route Sheet Instructions, labelled by product so a
  // multi-product visit reads clearly; identical text is not repeated.
  const seen = new Set<string>();
  const instructions = applied
    .filter((p) => p.careInstructions && !seen.has(p.careInstructions) && seen.add(p.careInstructions))
    .map(
      (p) => `<p style="${font}font-size:${fs}px;line-height:1.5;margin:0 0 ${roomy ? 12 : 8}px;color:#1e293b;">${applied.length > 1 ? `<strong>${escapeHtml(p.name)}:</strong> ` : ""}${escapeHtml(p.careInstructions as string).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

  // The technician's own completion note, when the org lets customers see it (the
  // same switch as the invoice template's "include technician notes").
  const techNotes =
    org.showTechNotes && d.techNotes
      ? `<div style="${font}font-size:${fs + 1}px;font-weight:bold;color:${accent};margin:${roomy ? 18 : 10}px 0 6px;">Technician notes</div><p style="${font}font-size:${fs}px;line-height:1.5;margin:0;color:#1e293b;">${escapeHtml(d.techNotes).replace(/\n/g, "<br>")}</p>`
      : "";

  return `<div style="${font}color:#1e293b;max-width:${opts.maxWidth ?? "760px"};margin:0 auto;padding:8px 4px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:${roomy ? 20 : 12}px;border-bottom:3px solid ${accent};">
    <tr>
      <td style="vertical-align:middle;padding-bottom:10px;">${logo}</td>
      <td style="${font}vertical-align:middle;text-align:right;font-size:10px;line-height:1.5;color:#475569;padding-bottom:10px;">${org.logoUrl ? `<strong style="font-size:12px;color:#0f172a;">${escapeHtml(org.name)}</strong><br>` : ""}${contact}</td>
    </tr>
  </table>
  <div style="${font}font-size:${roomy ? 20 : 16}px;font-weight:bold;color:${accent};margin-bottom:4px;">Chemical Application Notice</div>
  <div style="${font}font-size:${fs}px;color:#64748b;margin-bottom:${roomy ? 18 : 10}px;">${escapeHtml(d.clientName)}${d.addressLine ? ` &middot; ${escapeHtml(d.addressLine)}` : ""}${d.serviceName ? ` &middot; ${escapeHtml(d.serviceName)}` : ""}</div>
  <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:${roomy ? 20 : 12}px;"><tr>
    ${meta("Date", chemicalNoticeDateText(d, opts.timeZone), BLANK)}
    ${meta("Time", timeRange, `AM / PM ${BLANK}`)}
    ${meta("Weather", conditions, `${BLANK} &deg;F &nbsp; Sun / Rain / Clouds`)}
    ${meta("Applicator", [d.applicatorName, d.applicatorLicense ? `Lic. ${d.applicatorLicense}` : ""].filter(Boolean).join(" · "), BLANK)}
  </tr></table>
  <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:${roomy ? 22 : 12}px;">
    <tr>
      <th style="${th}">Product &amp; EPA #</th><th style="${th}">Targets</th><th style="${th}">Areas Treated</th>
      <th style="${th}">Ratio</th><th style="${th}">Amount Applied</th><th style="${th}">Method</th><th style="${th}">Re-Entry</th>
    </tr>
    ${productRows || `<tr><td colspan="7" style="${cell}">No products recorded.</td></tr>`}
  </table>
  ${instructions ? `<div style="${font}font-size:${fs + 1}px;font-weight:bold;color:${accent};margin-bottom:6px;">Instructions</div>${instructions}` : ""}
  ${techNotes}
  ${opts.footerNote ? `<p style="${font}font-size:11px;font-weight:bold;margin:8px 0 0;">${escapeHtml(opts.footerNote)}</p>` : ""}
  <div style="${font}font-size:10px;color:#94a3b8;margin-top:${roomy ? 24 : 12}px;">${escapeHtml(org.name)}${org.phone ? ` &middot; ${escapeHtml(org.phone)}` : ""}</div>
</div>`;
}

/** Resolves the client's `Customer` greeting etc. for callers that only have
 *  the data object (email merge vars). */
export function noticeOrgFromRow(org: {
  name?: string | null;
  address?: Record<string, string> | null;
  customizations?: Record<string, unknown> | null;
  brand_color?: string | null;
} | null): ChemicalNoticeOrg {
  const a = org?.address ?? {};
  const cityLine = [[a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" ");
  return {
    name: org?.name ?? "Your Service Provider",
    phone: a.phone ?? null,
    addressLines: [a.street, cityLine].filter((s): s is string => !!s),
    logoUrl: (org?.customizations?.logoDataUrl as string | undefined) ?? null,
    brandColor: org?.brand_color ?? null,
  };
}


/** Logo, accent colour and the "show technician notes" switch from the org's default
 *  invoice PDF template, so the notice looks like the invoice's chemical page.
 *  Failure-tolerant: returns {} and the notice falls back to the org's own branding. */
export async function loadInvoiceTemplateBranding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId?: string
): Promise<Pick<ChemicalNoticeOrg, "logoUrl" | "brandColor" | "showTechNotes">> {
  try {
    let q = supabase
      .from("crm_invoice_pdf_templates")
      .select("logo_url, accent_color, show_visit_notes")
      .eq("is_default", true)
      .is("deleted_at", null);
    if (orgId) q = q.eq("org_id", orgId);
    const { data } = await q.limit(1).maybeSingle();
    if (!data) return {};
    return {
      ...(data.logo_url ? { logoUrl: data.logo_url as string } : {}),
      ...(data.accent_color ? { brandColor: data.accent_color as string } : {}),
      showTechNotes: Boolean(data.show_visit_notes),
    };
  } catch {
    return {};
  }
}
