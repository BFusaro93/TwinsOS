import { loadChemicalNoticeData, loadInvoiceTemplateBranding, noticeOrgFromRow, renderChemicalNoticeHtml } from "@/lib/chemical/application-notice";
import { billingTermsLabel } from "@/lib/constants";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { getOrCreateInvoiceShareToken, buildInvoiceViewUrl } from "@/lib/invoices/share-token";
import { fetchOrgCardPaymentsAvailable, invoiceLinkLabel } from "@/lib/stripe/card-payments-available";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const fmtCents = (cents: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);

// Date-only columns ("YYYY-MM-DD") read back as that calendar day, never
// shifted by the server's zone.
const fmtDay = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

/**
 * Invoice tags for an enrollment that carries an invoice_id (invoice_*
 * triggers). Same tag names the invoice email route fills, so a template
 * written for either works in both. Empty map when there is no invoice.
 */
export async function buildInvoiceExtras(
  supabase: AnyClient,
  params: { orgId: string; invoiceId: string | null | undefined; html: boolean }
): Promise<Record<string, string>> {
  if (!params.invoiceId) return {};
  const { data: inv } = await supabase
    .from("crm_invoices")
    .select("id, status, invoice_number, invoice_date, due_date, terms, subtotal_cents, tax_cents, total_cents, balance_cents")
    .eq("id", params.invoiceId)
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inv) return {};

  // A draft isn't issued yet: the public invoice page refuses drafts, so no link is
  // created for one (the link tags come out empty). Void/deleted invoices get none
  // either (getOrCreateInvoiceShareToken).
  const token = inv.status === "draft"
    ? null
    : await getOrCreateInvoiceShareToken(supabase, { orgId: params.orgId, invoiceId: params.invoiceId });
  const url = token ? buildInvoiceViewUrl(token) : "";
  const due = fmtDay(inv.due_date as string | null);
  return {
    "[invoicenumber]": String(inv.invoice_number ?? ""),
    "[invoicedate]": fmtDay(inv.invoice_date as string | null),
    "[invoiceduedate]": due,
    "[invoiceterms]": billingTermsLabel(inv.terms as string | null),
    "[duedate]": due,
    "[invoicesubtotal]": fmtCents(inv.subtotal_cents as number),
    "[invoicetax]": fmtCents(inv.tax_cents as number),
    "[invoicetotal]": fmtCents(inv.total_cents as number),
    "[invoicebalance]": fmtCents(inv.balance_cents as number),
    "[balancedue]": fmtCents(inv.balance_cents as number),
    "[viewinvoiceonline]": url,
    // SMS is plain text, so the payment link there is the bare URL.
    // Still the online invoice when the org can't take payments online (no
    // Stripe Connect) — just labelled as a view link, never "Pay Now".
    "[paymentlink]": params.html && url
      ? `<a href="${url}" style="color:#fff;background:#60ab45;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">${invoiceLinkLabel(
          await fetchOrgCardPaymentsAvailable(supabase, params.orgId),
          "button"
        )}</a>`
      : url,
  };
}

/** A visit row as the service tags read it. */
type ServiceVisitRow = {
  id: string;
  job_id: string | null;
  job_service_id: string | null;
  scheduled_date: string | null;
  status: string | null;
  crm_job_services?: { service_name?: string | null } | null;
};

const SERVICE_VISIT_COLUMNS = "id, job_id, job_service_id, scheduled_date, status, created_at, crm_job_services(service_name)";

/**
 * Which visits of the run's service day a visit-scoped trigger is about: a completion
 * run reads the day's completed visits, a skip/cancel run the skipped/cancelled ones,
 * anything else the visits still on the schedule (not skipped/cancelled). Null = every
 * visit that day.
 */
function dayStatusesFor(triggerType: string | null | undefined): { only?: string[]; exclude?: string[] } {
  switch (triggerType) {
    case "visit_completed":
    case "service_visit_completed":
      return { only: ["completed"] };
    case "visit_skipped":
      return { only: ["skipped"] };
    case "visit_cancelled":
      return { only: ["cancelled"] };
    default:
      return { exclude: ["skipped", "cancelled"] };
  }
}

/**
 * Service names for a set of visits, distinct, in visit order. A visit scoped to one
 * service line names that line; a whole-job visit names every service the job
 * includes (lines marked not included aren't performed, so they're left out).
 */
async function serviceNamesForVisits(supabase: AnyClient, visits: ServiceVisitRow[]): Promise<string[]> {
  const wholeJobIds = [...new Set(visits.filter((v) => !v.job_service_id && v.job_id).map((v) => v.job_id as string))];
  const namesByJob = new Map<string, string[]>();
  if (wholeJobIds.length > 0) {
    const { data } = await supabase
      .from("crm_job_services")
      .select("job_id, service_name, sort_order, id")
      .in("job_id", wholeJobIds)
      .not("included", "is", false)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    for (const s of (data ?? []) as { job_id: string; service_name: string | null }[]) {
      if (!s.service_name) continue;
      const list = namesByJob.get(s.job_id) ?? [];
      list.push(s.service_name);
      namesByJob.set(s.job_id, list);
    }
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const v of visits) {
    const own = v.job_service_id
      ? [v.crm_job_services?.service_name ?? ""]
      : v.job_id ? namesByJob.get(v.job_id) ?? [] : [];
    for (const n of own) {
      const name = n.trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        names.push(name);
      }
    }
  }
  return names;
}

/** The chemical leave-behind for the given completed visits, one record per visit. Blank when none logged chemicals. */
async function renderChemicalNotices(supabase: AnyClient, orgId: string, visitIds: string[]): Promise<string> {
  if (visitIds.length === 0) return "";
  try {
    const notices = await loadChemicalNoticeData(supabase, visitIds, "applied", orgId);
    const ordered = visitIds.map((id) => notices.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
    if (ordered.length === 0) return "";
    const [{ data: org }, timeZone, branding] = await Promise.all([
      supabase.from("organizations").select("name, address, customizations, brand_color").eq("id", orgId).single(),
      getOrgTimeZone(supabase, orgId),
      loadInvoiceTemplateBranding(supabase, orgId),
    ]);
    const noticeOrg = { ...noticeOrgFromRow(org), ...branding };
    return ordered.map((n) => renderChemicalNoticeHtml(n, noticeOrg, { timeZone })).join('<div style="height:24px"></div>');
  } catch {
    // A failed lookup must not block the email; the tag just resolves blank.
    return "";
  }
}

/**
 * Service/visit tags.
 *  [servicename] [servicedate] [chemicalnotice] — the visit(s) the run is about:
 *   - A visit-scoped run (visit_completed, visit_dispatched, …; see enrollment-scope.ts)
 *     carries its service day (`visitDate`). These tags then read that client's visits
 *     on that day: every service done that day ("Mowing, Edging"), that date, and the
 *     chemical records of all of that day's completed visits.
 *   - Any other run isn't tied to a visit, so they read the client's most recent
 *     COMPLETED visit (latest day; ties broken by created_at then id, so the same
 *     visit is picked on every send) — its service line's name, as before.
 *  [nextservicename] [nextservicedate] — next scheduled visit (same tiebreak).
 *  [visitdate] [visitservices] — a visit-scoped run's service day and every service the
 *   client has that day (not skipped/cancelled); blank when the run isn't about a visit.
 */
export async function buildServiceExtras(
  supabase: AnyClient,
  params: {
    orgId: string;
    clientId: string | null | undefined;
    today: string;
    html?: boolean;
    /** The run's service day (crm_sequence_enrollments.visit_date), for visit-scoped triggers. */
    visitDate?: string | null;
    /** The trigger that started the run (crm_sequence_enrollments.trigger_type). */
    triggerType?: string | null;
  }
): Promise<Record<string, string>> {
  if (!params.clientId) return {};
  const base = () =>
    supabase
      .from("crm_job_visits")
      .select(SERVICE_VISIT_COLUMNS)
      .eq("org_id", params.orgId)
      .eq("client_id", params.clientId)
      .is("deleted_at", null);

  const nextQuery = base()
    .in("status", ["scheduled", "dispatched", "in_progress"])
    .gte("scheduled_date", params.today)
    .order("scheduled_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nameOf = (v: ServiceVisitRow | null) => v?.crm_job_services?.service_name ?? "";
  let serviceName = "";
  let serviceDate = "";
  let visitDate = "";
  let visitServices = "";
  let completedIds: string[] = [];

  if (params.visitDate) {
    const { data: dayRows } = await base()
      .eq("scheduled_date", params.visitDate)
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const day = (dayRows ?? []) as ServiceVisitRow[];
    const { only, exclude } = dayStatusesFor(params.triggerType);
    let named = day.filter((v) => (only ? only.includes(v.status ?? "") : !(exclude ?? []).includes(v.status ?? "")));
    // Nothing in the expected state any more (e.g. the visit moved on since the run
    // started): name whatever the client has on that day.
    if (named.length === 0) named = day;
    serviceName = (await serviceNamesForVisits(supabase, named)).join(", ");
    serviceDate = fmtDay(params.visitDate);
    // [visitdate] / [visitservices]: the run's service day and every service the client
    // has on it (skipped / cancelled visits left out unless that's all there is),
    // whatever the trigger — e.g. a day-before reminder from "Visit was dispatched".
    visitDate = fmtDay(params.visitDate);
    const scheduled = day.filter((v) => v.status !== "skipped" && v.status !== "cancelled");
    visitServices = (await serviceNamesForVisits(supabase, scheduled.length > 0 ? scheduled : day)).join(", ");
    completedIds = day.filter((v) => v.status === "completed").map((v) => v.id);
  } else {
    const { data: last } = await base()
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastRow = last as ServiceVisitRow | null;
    if (lastRow) {
      serviceName = nameOf(lastRow);
      serviceDate = fmtDay(lastRow.scheduled_date);
      completedIds = [lastRow.id];
    }
  }

  const { data: next } = await nextQuery;
  const nextRow = next as ServiceVisitRow | null;

  // The leave-behind record(s). Contract clients get no invoice, so an automation
  // after a completed visit is how they receive it. Blank when no chemicals were logged.
  const chemicalNotice = params.html !== false ? await renderChemicalNotices(supabase, params.orgId, completedIds) : "";

  return {
    "[chemicalnotice]": chemicalNotice,
    "[servicename]": serviceName,
    "[servicedate]": serviceDate,
    "[nextservicename]": nameOf(nextRow),
    "[nextservicedate]": fmtDay(nextRow?.scheduled_date),
    // Visit-day tags: blank for a run that isn't about a visit.
    "[visitdate]": visitDate,
    "[visitservices]": visitServices,
  };
}
