import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
} from "@/lib/reports/helpers";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { isoInZone, ymd, zoneDateParts } from "@/lib/time/zone";

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
      "Only chemicals marked as applied (Used) are included. Service Date is the date the application was made (its start time, else the visit date).",
      "Applications count once their visit is in progress or completed — scheduled, dispatched, cancelled and skipped visits are excluded, so the report never lists a lawn as sprayed before the crew has been there.",
      "Applicator shows the name with the license number the employee had on file when the application was saved. Applied (Time) is the application start–end entered on the record (pre-filled from the crew's clock-in/out).",
      "Chemical Applied is the concentrate used; Solution Applied is the total mixed solution actually applied — they can be in different units (e.g. ounces of chemical, gallons of solution).",
    ],
    analysis: (params, timeZone) => ({
      dataset: "rpt_chemical_applications",
      // Compact set — the combined display columns keep a state record legible
      // on one landscape page. The raw fields (separate amount/unit, wind
      // speed/direction, licence, start/end times) remain in the dataset for
      // Custom Analyses and spreadsheet exports.
      columns: [
        "service_date",
        "client_name",
        "service_location",
        "chemical_name",
        "epa_registration_number",
        "restricted_product",
        "re_entry_interval",
        "chemical_applied",
        "solution_applied",
        "application_method",
        "targets",
        "areas_treated",
        "conditions",
        "applicator",
        "application_window",
      ],
      filters: [
        // crm_chemical_applications.used = actually applied (a compliance
        // record must not list planned-but-unapplied product).
        { column: "used", op: "eq", value: true },
        ...dateRangeFilters("service_date", params, timeZone, { preset: "this_month" }),
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
    run: async ({ supabase, params, timeZone }) => {
      const { from, to } = (() => {
        const now = new Date();
        let f = params.from || null;
        let t = params.to || null;
        if (!f && !t) {
          t = isoInZone(now, timeZone);
          const { year, month } = zoneDateParts(now, timeZone);
          f = ymd(year, month, 1);
        }
        return { from: f, to: t };
      })();

      interface Row {
        chemical_amount: number | null;
        solution_amount: number | null;
        unit: { name: string | null } | null;
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
            "chemical_amount, solution_amount, unit:crm_chemical_lookup_items!crm_chemical_applications_unit_of_measure_id_fkey(name), product:product_id(name), crm_job_visits!inner(status, scheduled_date, clients:client_id(display_name))"
          )
          .is("deleted_at", null)
          // Dispatched = on the crew's board but not started; still to be loaded.
          .is("crm_job_visits.deleted_at", null)
          .in("crm_job_visits.status", ["scheduled", "dispatched"]);
        if (from) query = query.gte("crm_job_visits.scheduled_date", from);
        if (to) query = query.lte("crm_job_visits.scheduled_date", to);
        return query;
      });

      // Amounts are recorded in whatever unit each application used (gal, oz,
      // lb…), so quantities are only addable within the SAME unit — group by
      // chemical + unit instead of summing mixed units into one number.
      const SEP = "\u0000";
      const totalsByChemical = new Map<string, number>();
      const usageByClientChemical = new Map<string, Map<string, number>>();

      for (const r of rows) {
        const visit = r.crm_job_visits;
        if (!visit) continue;
        const chemical = r.product?.name || "(unknown)";
        const unit = r.unit?.name ?? "";
        const chemKey = `${chemical}${SEP}${unit}`;
        const amount = r.chemical_amount ?? 0;
        totalsByChemical.set(chemKey, (totalsByChemical.get(chemKey) ?? 0) + amount);

        const client = visit.clients?.display_name || "(unknown client)";
        let byChemical = usageByClientChemical.get(client);
        if (!byChemical) {
          byChemical = new Map<string, number>();
          usageByClientChemical.set(client, byChemical);
        }
        byChemical.set(chemKey, (byChemical.get(chemKey) ?? 0) + amount);
      }

      const resultRows = [...usageByClientChemical.entries()].flatMap(([client_name, byChemical]) =>
        [...byChemical.entries()].map(([chemKey, quantity]) => {
          const [chemical_name, unit] = chemKey.split(SEP);
          return {
            client_name,
            chemical_name,
            unit,
            quantity: Math.round(quantity * 10000) / 10000,
          };
        })
      );

      const totalNote =
        [...totalsByChemical.entries()]
          .map(([chemKey, qty]) => {
            const [name, unit] = chemKey.split(SEP);
            return `${name}: ${Math.round(qty * 10000) / 10000}${unit ? ` ${unit}` : ""}`;
          })
          .join(" · ") || "No chemicals scheduled in this range.";

      return buildResult(
        [
          col("client_name", "Client"),
          col("chemical_name", "Chemical"),
          col("unit", "Unit"),
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
  {
    key: "daily-load-list-report",
    section: "service",
    name: "Daily Load List",
    description:
      "What each crew needs to load on the truck for a given day — chemicals (concentrate amount and finished spray-mix volume) and general materials, grouped by crew.",
    filters: [],
    notes: [
      "Chemical amounts use an already-entered application record for that visit when one exists, otherwise fall back to the default Application Rate x an Area Custom Field on the property (same estimate as Materials Needed).",
      "Mix volume is the total finished spray solution (e.g. gallons of mix), computed from the product's default rate's dilution settings — it only appears when that rate has a Mixed with Water/Product ratio configured with convertible units.",
      "Crew is the visit's crew override if set, otherwise the job's default crew. Visits/jobs with no crew assigned appear under Unassigned.",
    ],
    href: "/crm/reports/daily-load-list",
  },
];
