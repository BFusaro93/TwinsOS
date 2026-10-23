import { logger } from "@/lib/logger";
import type { InvoicePDFChemicalApplication } from "@/components/crm/invoices/pdf/InvoiceDocument";

const log = logger.child("invoice-chemicals");

function formatAmount(amount: number | null, unit: string | null): string {
  if (amount == null) return "—";
  return [String(Number(amount)), unit].filter(Boolean).join(" ");
}

/** Chemical applications recorded on the visits this invoice bills, shaped for
 *  the PDF's "Chemical Application Record" page. Only rows that count as
 *  applied: used, not deleted, and — for rows preloaded at the planned amount —
 *  confirmed by the crew/office (an unconfirmed preload is just an estimate).
 *  Failure-tolerant: a lookup error yields no rows rather than failing the PDF.
 *  Always scoped by org_id. */
export async function loadInvoiceChemicalsForPdf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  visitIds: (string | null | undefined)[]
): Promise<InvoicePDFChemicalApplication[]> {
  const ids = [...new Set(visitIds.filter((v): v is string => Boolean(v)))];
  if (ids.length === 0) return [];
  try {
    const { data: apps, error } = await supabase
      .from("crm_chemical_applications")
      .select(
        "visit_id, product_id, chemical_amount, unit_of_measure_id, target_ids, areas_treated_ids, application_method_id, application_rate_label, epa_number_snapshot, applicator_license_number, re_entry_interval_snapshot, preloaded, confirmed_at"
      )
      .eq("org_id", orgId)
      .in("visit_id", ids)
      .eq("used", true)
      .is("deleted_at", null);
    if (error) {
      log.error("load chemical applications failed", { error: error.message });
      return [];
    }
    type AppRow = {
      visit_id: string;
      product_id: string | null;
      chemical_amount: number | null;
      unit_of_measure_id: string | null;
      target_ids: string[] | null;
      areas_treated_ids: string[] | null;
      application_rate_label: string | null;
      epa_number_snapshot: string | null;
      application_method_id: string | null;
      applicator_license_number: string | null;
      re_entry_interval_snapshot: string | null;
      preloaded: boolean;
      confirmed_at: string | null;
    };
    const rows = ((apps ?? []) as AppRow[]).filter(
      (a) => a.chemical_amount != null && (!a.preloaded || a.confirmed_at != null)
    );
    if (rows.length === 0) return [];

    const lookupIds = [
      ...new Set(
        rows.flatMap((a) => [a.unit_of_measure_id, a.application_method_id, ...(a.target_ids ?? []), ...(a.areas_treated_ids ?? [])]).filter(Boolean)
      ),
    ] as string[];
    const productIds = [...new Set(rows.map((a) => a.product_id).filter(Boolean))] as string[];

    const [lookups, products, visits] = await Promise.all([
      lookupIds.length
        ? supabase.from("crm_chemical_lookup_items").select("id, name").eq("org_id", orgId).in("id", lookupIds)
        : { data: [] },
      productIds.length
        ? supabase.from("product_items").select("id, name, re_entry_interval, epa_registration_number").eq("org_id", orgId).in("id", productIds)
        : { data: [] },
      supabase.from("crm_job_visits").select("id, scheduled_date").eq("org_id", orgId).in("id", ids),
    ]);

    const lookupName = new Map<string, string>(
      ((lookups.data ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])
    );
    const product = new Map<string, { name: string; re_entry_interval: string | null; epa_registration_number: string | null }>(
      (
        (products.data ?? []) as {
          id: string;
          name: string;
          re_entry_interval: string | null;
          epa_registration_number: string | null;
        }[]
      ).map((p) => [p.id, p])
    );
    const visitDate = new Map<string, string | null>(
      ((visits.data ?? []) as { id: string; scheduled_date: string | null }[]).map((v) => [v.id, v.scheduled_date])
    );

    return rows
      .map((a) => {
        const p = a.product_id ? product.get(a.product_id) : undefined;
        return {
          serviceDate: visitDate.get(a.visit_id) ?? null,
          product: p?.name ?? "—",
          epaNumber: a.epa_number_snapshot || p?.epa_registration_number || null,
          amount: formatAmount(a.chemical_amount, a.unit_of_measure_id ? lookupName.get(a.unit_of_measure_id) ?? null : null),
          areasTreated:
            (a.areas_treated_ids ?? [])
              .map((t) => lookupName.get(t))
              .filter(Boolean)
              .sort()
              .join(", ") || "—",
          rate: a.application_rate_label || "—",
          method: a.application_method_id ? lookupName.get(a.application_method_id) ?? "—" : "—",
          targets:
            (a.target_ids ?? [])
              .map((t) => lookupName.get(t))
              .filter(Boolean)
              .sort()
              .join(", ") || "—",
          reEntryInterval: a.re_entry_interval_snapshot || p?.re_entry_interval || "—",
          applicatorLicense: a.applicator_license_number || "—",
        };
      })
      .sort((x, y) => (x.serviceDate ?? "").localeCompare(y.serviceDate ?? "") || x.product.localeCompare(y.product));
  } catch (err) {
    log.error("load chemical applications threw", { error: err });
    return [];
  }
}
