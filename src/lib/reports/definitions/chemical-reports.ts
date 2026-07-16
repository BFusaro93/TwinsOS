import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
} from "@/lib/reports/helpers";

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
      "Applicator Name/License and Application Start/End Time only populate when the applying employee has a license number on file.",
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
      filters: [...dateRangeFilters("service_date", params, { preset: "this_month" })],
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
      "Chemical quantities needed for scheduled (not-yet-completed) visits — use to load the truck before the day's chemical jobs.",
    filters: [dateRangeFilterDef("Scheduled Between", "this_month")],
    run: async ({ supabase, params }) => {
      const { from, to } = (() => {
        const now = new Date();
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        let f = params.from || null;
        let t = params.to || null;
        if (!f && !t) {
          t = iso(now);
          f = iso(new Date(now.getFullYear(), now.getMonth(), 1));
        }
        return { from: f, to: t };
      })();

      let query = supabase
        .from("crm_chemical_applications")
        .select(
          "chemical_amount, solution_amount, product:product_id(name), crm_job_visits:visit_id(status, scheduled_date, clients:client_id(display_name))"
        )
        .is("deleted_at", null)
        .limit(5000);
      if (from) query = query.gte("crm_job_visits.scheduled_date", from);
      if (to) query = query.lte("crm_job_visits.scheduled_date", to);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

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
      const rows = (data ?? []) as unknown as Row[];

      const totalsByChemical = new Map<string, number>();
      const usageByClientChemical = new Map<string, Map<string, number>>();

      for (const r of rows) {
        const visit = r.crm_job_visits;
        if (!visit || visit.status !== "scheduled") continue;
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
    name: "Material Resource Planning Report",
    description:
      "For every chemical: quantity needed for outstanding scheduled services, amount on hand, amount on order, and the resulting overage/shortfall.",
    filters: [],
    notes: [
      "Estimated Amount Needed requires an Area Custom Field to be set under Settings > Chemical Tracking, and a default Application Rate on the product.",
      "Amount on Order sums line-item quantities on open Requisitions (pending approval/approved) and Purchase Orders (requested through partially fulfilled) for that product.",
      "Reorder manually from the Products or Requisitions screens — this report doesn't create purchase orders.",
    ],
    run: async ({ supabase }) => {
      const { data: settings } = await supabase
        .from("crm_chemical_settings")
        .select("area_custom_field_id")
        .maybeSingle();
      const areaFieldId = settings?.area_custom_field_id ?? null;

      const { data: products, error: productsErr } = await supabase
        .from("product_items")
        .select("id, name, quantity_on_hand")
        .eq("track_chemicals", true)
        .is("deleted_at", null);
      if (productsErr) throw new Error(productsErr.message);
      if (!products || products.length === 0) {
        return buildResult(
          [col("product_name", "Product")],
          [],
          ["No chemical products configured yet."]
        );
      }
      const productIds = products.map((p) => p.id);

      const { data: serviceChemicals, error: scErr } = await supabase
        .from("crm_service_chemicals")
        .select("service_id, product_id")
        .in("product_id", productIds);
      if (scErr) throw new Error(scErr.message);
      const productIdsByService = new Map<string, string[]>();
      for (const sc of serviceChemicals ?? []) {
        const list = productIdsByService.get(sc.service_id) ?? [];
        list.push(sc.product_id);
        productIdsByService.set(sc.service_id, list);
      }

      interface VisitRow {
        id: string;
        crm_jobs: {
          property_id: string | null;
          status: string | null;
          crm_job_services: { service_id: string | null }[] | null;
        } | null;
      }
      const { data: visitsRaw, error: visitsErr } = await supabase
        .from("crm_job_visits")
        .select("id, crm_jobs!inner(property_id, status, crm_job_services(service_id))")
        .eq("status", "scheduled")
        .is("deleted_at", null)
        .limit(5000);
      if (visitsErr) throw new Error(visitsErr.message);
      const visits = (visitsRaw ?? []) as unknown as VisitRow[];

      // product_id -> [{ propertyId }] — one entry per outstanding scheduled visit that needs it
      const demandByProduct = new Map<string, { propertyId: string | null }[]>();
      for (const v of visits) {
        const job = v.crm_jobs;
        if (!job || job.status === "cancelled" || job.status === "completed") continue;
        const serviceIds = (job.crm_job_services ?? []).map((js) => js.service_id).filter(Boolean) as string[];
        const productIdsForVisit = new Set<string>();
        for (const sid of serviceIds) {
          for (const pid of productIdsByService.get(sid) ?? []) productIdsForVisit.add(pid);
        }
        for (const pid of productIdsForVisit) {
          const list = demandByProduct.get(pid) ?? [];
          list.push({ propertyId: job.property_id });
          demandByProduct.set(pid, list);
        }
      }

      const distinctPropertyIds = [
        ...new Set(
          [...demandByProduct.values()].flat().map((d) => d.propertyId).filter(Boolean) as string[]
        ),
      ];

      const areaValueByProperty = new Map<string, number>();
      if (areaFieldId && distinctPropertyIds.length > 0) {
        const { data: fieldValues } = await supabase
          .from("crm_property_custom_field_values")
          .select("property_id, value_number")
          .eq("field_def_id", areaFieldId)
          .in("property_id", distinctPropertyIds);
        for (const fv of fieldValues ?? []) {
          if (fv.value_number != null) areaValueByProperty.set(fv.property_id, Number(fv.value_number));
        }
      }

      const { data: rates } = await supabase
        .from("crm_chemical_application_rates")
        .select("product_id, rate_qty, area_qty, is_default")
        .in("product_id", productIds)
        .eq("is_default", true);
      const defaultRateByProduct = new Map<string, { rateQty: number | null; areaQty: number | null }>();
      for (const r of rates ?? []) {
        defaultRateByProduct.set(r.product_id, { rateQty: r.rate_qty, areaQty: r.area_qty });
      }

      const activeReqStatuses = new Set(["pending_approval", "approved"]);
      const activePoStatuses = new Set(["requested", "pending", "approved", "ordered", "partially_fulfilled"]);
      const onOrderByProduct = new Map<string, number>();

      const { data: reqLines } = await supabase
        .from("requisition_line_items")
        .select("product_item_id, quantity, requisitions!inner(status)")
        .in("product_item_id", productIds);
      for (const rl of (reqLines ?? []) as unknown as {
        product_item_id: string | null;
        quantity: number;
        requisitions: { status: string } | null;
      }[]) {
        if (!rl.product_item_id || !rl.requisitions || !activeReqStatuses.has(rl.requisitions.status)) continue;
        onOrderByProduct.set(rl.product_item_id, (onOrderByProduct.get(rl.product_item_id) ?? 0) + rl.quantity);
      }

      const { data: poLines } = await supabase
        .from("po_line_items")
        .select("product_item_id, quantity, purchase_orders!inner(status)")
        .in("product_item_id", productIds);
      for (const pl of (poLines ?? []) as unknown as {
        product_item_id: string | null;
        quantity: number;
        purchase_orders: { status: string } | null;
      }[]) {
        if (!pl.product_item_id || !pl.purchase_orders || !activePoStatuses.has(pl.purchase_orders.status)) continue;
        onOrderByProduct.set(pl.product_item_id, (onOrderByProduct.get(pl.product_item_id) ?? 0) + pl.quantity);
      }

      const resultRows = products.map((p) => {
        const demand = demandByProduct.get(p.id) ?? [];
        const outstandingServices = demand.length;
        const outstandingArea = demand.reduce(
          (sum, d) => sum + (d.propertyId ? areaValueByProperty.get(d.propertyId) ?? 0 : 0),
          0
        );
        const rate = defaultRateByProduct.get(p.id);
        const estimatedNeeded = demand.reduce((sum, d) => {
          const areaValue = d.propertyId ? areaValueByProperty.get(d.propertyId) : undefined;
          if (!rate || !rate.areaQty || rate.rateQty == null || areaValue == null) return sum;
          return sum + (areaValue / rate.areaQty) * rate.rateQty;
        }, 0);
        const onHand = p.quantity_on_hand ?? 0;
        const onOrder = onOrderByProduct.get(p.id) ?? 0;
        const shortfall = onHand + onOrder - estimatedNeeded;

        return {
          product_name: p.name,
          outstanding_services: outstandingServices,
          outstanding_area: Math.round(outstandingArea * 100) / 100,
          estimated_needed: Math.round(estimatedNeeded * 10000) / 10000,
          on_hand: onHand,
          on_order: onOrder,
          shortfall: Math.round(shortfall * 10000) / 10000,
        };
      });

      return buildResult(
        [
          col("product_name", "Product"),
          col("outstanding_services", "Outstanding Services", "number", false),
          col("outstanding_area", "Outstanding Area", "number", false),
          col("estimated_needed", "Est. Amount Needed", "number", false),
          col("on_hand", "Amount on Hand", "number", false),
          col("on_order", "Amount on Order", "number", false),
          col("shortfall", "Overage / Shortfall", "number", false),
        ],
        resultRows
      );
    },
  },
];
