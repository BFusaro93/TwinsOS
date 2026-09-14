import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
} from "@/lib/reports/helpers";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { isoNy, nyDateParts, ymd } from "@/lib/reports/ny-date";

// ============================================================
// Chemical Tracking section — pesticide/fertilizer application
// recordkeeping for state regulatory compliance.
// ============================================================

export const CHEMICAL_REPORTS: PrebuiltReportDef[] = [
  {
    key: "chemical-tracking-report",
    section: "service",
    name: "Chemical Tracking Report",
    description:
      "Post-application compliance record of chemicals actually applied — date, EPA #, quantities, conditions, applicator, and license number.",
    filters: [dateRangeFilterDef("Applied Between", "this_month")],
    notes: [
      "Only chemicals marked as applied (Used) are included — planned applications that were never made are excluded. Service Date is the visit date when the application is tied to a visit.",
      "Applicator Name populates whenever an applicator is assigned to the application. Applicator License Number only populates if that employee had a license on file at the time. Application Start/End Time populate only when entered on the application record, independent of licensing.",
      "Chemical Amount is the concentrate used; Solution Amount is the total mixed solution actually applied.",
    ],
    analysis: (params) => ({
      dataset: "rpt_chemical_applications",
      columns: [
        "service_date",
        "client_name",
        "service_address",
        "service_city",
        "chemical_name",
        "epa_registration_number",
        "re_entry_interval",
        "restricted_product",
        "chemical_amount",
        "solution_amount",
        "unit_of_measure",
        "targets",
        "areas_treated",
        "application_method",
        "application_rate_label",
        "temperature",
        "wind_speed",
        "wind_direction",
        "ph_level",
        "applicator_name",
        "applicator_license_number",
        "application_start_time",
        "application_end_time",
        "budgeted_concentrate_amount",
        "used",
      ],
      filters: [
        // crm_chemical_applications.used = actually applied (a compliance
        // record must not list planned-but-unapplied product).
        { column: "used", op: "eq", value: true },
        ...dateRangeFilters("service_date", params, { preset: "this_month" }),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "service_date",
      sortDir: "asc",
    }),
  },
  {
    key: "planned-chemical-usage-report",
    section: "service",
    name: "Planned Chemical Usage Report",
    description:
      "Chemical quantities needed for scheduled and dispatched (not-yet-started) visits — use to load the truck before the day's chemical jobs.",
    filters: [dateRangeFilterDef("Scheduled Between", "this_month")],
    notes: [
      "Includes visits in Scheduled or Dispatched status only; in-progress and completed visits are excluded.",
    ],
    run: async ({ supabase, params }) => {
      const { from, to } = (() => {
        const now = new Date();
        let f = params.from || null;
        let t = params.to || null;
        if (!f && !t) {
          t = isoNy(now);
          const { year, month } = nyDateParts(now);
          f = ymd(year, month, 1);
        }
        return { from: f, to: t };
      })();

      interface Row {
        chemical_amount: number | null;
        solution_amount: number | null;
        product: { name: string | null } | null;
        crm_job_visits: {
          status: string | null;
          scheduled_date: string | null;
          clients: { display_name: string | null } | null;
        } | null;
      }
      // `!inner` makes the visit filters actually drop rows server-side (a
      // plain embed only nulls out the embedded object, so every application
      // in the org came back and was filtered here — and past 1000 rows the
      // in-range ones fell off the end of the page).
      const rows = await fetchAllRows<Row>(() => {
        let query = supabase
          .from("crm_chemical_applications")
          .select(
            "chemical_amount, solution_amount, product:product_id(name), crm_job_visits!inner(status, scheduled_date, clients:client_id(display_name))"
          )
          .is("deleted_at", null)
          // Dispatched = on the crew's board but not started; still to be loaded.
          .in("crm_job_visits.status", ["scheduled", "dispatched"]);
        if (from) query = query.gte("crm_job_visits.scheduled_date", from);
        if (to) query = query.lte("crm_job_visits.scheduled_date", to);
        return query;
      });

      const totalsByChemical = new Map<string, number>();
      const usageByClientChemical = new Map<string, Map<string, number>>();

      for (const r of rows) {
        const visit = r.crm_job_visits;
        if (!visit) continue;
        const chemical = r.product?.name || "(unknown)";
        const amount = r.chemical_amount ?? 0;
        totalsByChemical.set(chemical, (totalsByChemical.get(chemical) ?? 0) + amount);

        const client = visit.clients?.display_name || "(unknown client)";
        let byChemical = usageByClientChemical.get(client);
        if (!byChemical) {
          byChemical = new Map<string, number>();
          usageByClientChemical.set(client, byChemical);
        }
        byChemical.set(chemical, (byChemical.get(chemical) ?? 0) + amount);
      }

      const resultRows = [...usageByClientChemical.entries()].flatMap(([client_name, byChemical]) =>
        [...byChemical.entries()].map(([chemical_name, quantity]) => ({
          client_name,
          chemical_name,
          quantity: Math.round(quantity * 10000) / 10000,
        }))
      );

      const totalNote =
        [...totalsByChemical.entries()]
          .map(([name, qty]) => `${name}: ${Math.round(qty * 10000) / 10000}`)
          .join(" · ") || "No chemicals scheduled in this range.";

      return buildResult(
        [
          col("client_name", "Client"),
          col("chemical_name", "Chemical"),
          col("quantity", "Concentrate Needed", "number", false),
        ],
        resultRows,
        [`Chemical Totals — ${totalNote}`]
      );
    },
  },
  {
    key: "material-resource-planning-report",
    section: "service",
    name: "Materials Needed for Upcoming Jobs",
    description:
      "For every product (chemical or general material): quantity needed for outstanding scheduled and waiting-list jobs, amount on hand, amount on order, and the resulting shortfall — with the ability to create a Requisition or PO directly from a shortfall.",
    filters: [],
    notes: [
      "Chemical quantities require an Area Custom Field under Settings > Chemical Tracking and a default Application Rate on the product. General materials come from each job's Products section.",
      "Amount on Order sums line-item quantities on open Requisitions (pending approval/approved) and Purchase Orders (requested through partially fulfilled) for that product, less any quantity already received against those PO lines.",
      "Demand counts visits in Scheduled, Dispatched, or In Progress status, plus waiting-list jobs that have not been dispatched yet. Job products already marked Invoiced or Used are excluded — their quantity has already come out of on-hand.",
    ],
    href: "/crm/reports/materials-needed",
  },
];
