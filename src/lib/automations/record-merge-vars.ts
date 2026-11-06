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
    .select("id, invoice_number, invoice_date, due_date, terms, subtotal_cents, tax_cents, total_cents, balance_cents")
    .eq("id", params.invoiceId)
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inv) return {};

  const token = await getOrCreateInvoiceShareToken(supabase, { orgId: params.orgId, invoiceId: params.invoiceId });
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

/**
 * Service/visit tags. An enrollment isn't tied to one visit, so these read the
 * client's most recent COMPLETED visit and their next upcoming one:
 *  [servicename] [servicedate] — last completed visit's service and day
 *  [nextservicename] [nextservicedate] — next scheduled visit
 */
export async function buildServiceExtras(
  supabase: AnyClient,
  params: { orgId: string; clientId: string | null | undefined; today: string; html?: boolean }
): Promise<Record<string, string>> {
  if (!params.clientId) return {};
  const base = () =>
    supabase
      .from("crm_job_visits")
      .select("id, scheduled_date, job_service_id, crm_job_services(service_name)")
      .eq("org_id", params.orgId)
      .eq("client_id", params.clientId)
      .is("deleted_at", null);
  const [{ data: last }, { data: next }] = await Promise.all([
    base().eq("status", "completed").order("scheduled_date", { ascending: false }).limit(1).maybeSingle(),
    base().in("status", ["scheduled", "dispatched", "in_progress"]).gte("scheduled_date", params.today).order("scheduled_date", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const nameOf = (v: { crm_job_services?: { service_name?: string } | null } | null) =>
    v?.crm_job_services?.service_name ?? "";
  // The leave-behind record for the last completed visit. Contract clients get no
  // invoice, so an automation after a completed visit is how they receive it.
  // Blank when that visit logged no chemicals.
  let chemicalNotice = "";
  if (last?.id && params.html !== false) {
    try {
      const notices = await loadChemicalNoticeData(supabase, [last.id as string], "applied", params.orgId);
      const notice = notices.get(last.id as string);
      if (notice) {
        const [{ data: org }, timeZone] = await Promise.all([
          supabase.from("organizations").select("name, address, customizations, brand_color").eq("id", params.orgId).single(),
          getOrgTimeZone(supabase, params.orgId),
        ]);
        chemicalNotice = renderChemicalNoticeHtml(notice, { ...noticeOrgFromRow(org), ...(await loadInvoiceTemplateBranding(supabase, params.orgId)) }, { timeZone });
      }
    } catch {
      // A failed lookup must not block the email; the tag just resolves blank.
    }
  }
  return {
    "[chemicalnotice]": chemicalNotice,
    "[servicename]": nameOf(last),
    "[servicedate]": fmtDay(last?.scheduled_date as string | undefined),
    "[nextservicename]": nameOf(next),
    "[nextservicedate]": fmtDay(next?.scheduled_date as string | undefined),
  };
}
