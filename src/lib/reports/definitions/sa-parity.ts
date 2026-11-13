import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
  issuedInvoiceFilter,
  resolveDateRange,
} from "@/lib/reports/helpers";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { computePayroll } from "@/lib/payroll/compute";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { daysBetweenYmd, mondayOfYmd } from "@/lib/time/zone";

// ============================================================
// Reports modelled on Service Autopilot reports of the same name:
// Credit Report, Invoiced Products Report, Won Estimates Service Products
// Report and Resource Time Utilization.
// ============================================================

/** A client's label as the rpt_* views show it: soft-deleted clients keep their name with a suffix. */
function clientLabel(c: { display_name: string | null; deleted_at: string | null } | null): string {
  if (!c) return "(deleted)";
  if (c.deleted_at) return c.display_name ? `${c.display_name} (deleted)` : "(deleted)";
  return c.display_name ?? "";
}

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  return `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
}

// ── Credit Report ────────────────────────────────────────────────────────────

const UNAPPLIED_OPTIONS = [
  { value: "yes", label: "Has unapplied balance" },
  { value: "no", label: "Fully applied" },
];

interface CreditRow {
  payment_date: string | null;
  reference: string | null;
  memo: string | null;
  amount_cents: number | null;
  unused_amount_cents: number | null;
  refunded_amount_cents: number | null;
  clients: { display_name: string | null; account_number: string | null; deleted_at: string | null } | null;
  invoice: { invoice_number: number | null } | null;
  crm_payment_allocations: { amount_cents: number | null; invoice: { invoice_number: number | null } | null }[] | null;
}

// ── Won Estimates Service Products ───────────────────────────────────────────

interface EstimateProductRow {
  name: string | null;
  product_id: string | null;
  qty: number | null;
  rate_cents: number | null;
  total_cents: number | null;
  estimate_line_items: {
    service_name: string | null;
    estimates: {
      estimate_number: number | null;
      estimate_date: string | null;
      subtotal_cents: number | null;
      discount_cents: number | null;
      clients: { display_name: string | null; deleted_at: string | null } | null;
      sales_rep: { first_name: string | null; last_name: string | null } | null;
    } | null;
  } | null;
}

// ── Resource Time Utilization ────────────────────────────────────────────────

const UTILIZATION_PERIOD_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

/** Longest window the utilization report computes in one run (payroll math is per member-day). */
const MAX_UTILIZATION_DAYS = 366;

const TIME_TYPES = [
  { key: "services", label: "Time on Services" },
  { key: "drive", label: "Drive Time" },
  { key: "shop", label: "Shop / Other Paid Time" },
  { key: "breaks", label: "Breaks & Lunch (unpaid)" },
] as const;
type TimeTypeKey = (typeof TIME_TYPES)[number]["key"];

/** Sort key + label for the period a work date falls in. */
function periodOf(workDate: string, period: string): { key: string; label: string } {
  const year = workDate.slice(0, 4);
  switch (period) {
    case "day":
      return { key: workDate, label: workDate };
    case "week": {
      const monday = mondayOfYmd(workDate);
      return { key: monday, label: `Week of ${monday}` };
    }
    case "month":
      return { key: workDate.slice(0, 7), label: workDate.slice(0, 7) };
    case "quarter": {
      const q = Math.floor((Number(workDate.slice(5, 7)) - 1) / 3) + 1;
      return { key: `${year}-Q${q}`, label: `${year} Q${q}` };
    }
    case "year":
      return { key: year, label: year };
    default:
      return { key: "", label: "" };
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const SA_PARITY_REPORTS: PrebuiltReportDef[] = [
  {
    key: "credit-report",
    section: "financial",
    name: "Credit Report",
    description:
      "Lists account credits issued in a date range — the client, reference, memo, amount, what has been applied to invoices, and any unapplied balance still on account.",
    filters: [
      dateRangeFilterDef("Credit Date", "this_year"),
      { key: "unapplied", label: "Unapplied Balance", type: "select", options: UNAPPLIED_OPTIONS },
    ],
    run: async ({ supabase, params, timeZone }) => {
      const { from, to } = resolveDateRange(params, "this_year", timeZone);
      const data = await fetchAllRows<CreditRow>(() => {
        let query = supabase
          .from("crm_payments")
          .select(
            "payment_date, reference, memo, amount_cents, unused_amount_cents, refunded_amount_cents, " +
              "clients:client_id(display_name, account_number, deleted_at), " +
              "invoice:invoice_id(invoice_number), " +
              "crm_payment_allocations(amount_cents, invoice:invoice_id(invoice_number))"
          )
          .eq("is_credit", true)
          .is("deleted_at", null);
        if (from) query = query.gte("payment_date", from);
        if (to) query = query.lte("payment_date", to);
        return query.order("payment_date", { ascending: false });
      });

      const rows = data
        .map((r) => {
          const amount = r.amount_cents ?? 0;
          const unapplied = r.unused_amount_cents ?? 0;
          // Same rule as rpt_payments.applied_amount_cents.
          const applied = Math.max(0, amount - unapplied - (r.refunded_amount_cents ?? 0));
          const allocNumbers = (r.crm_payment_allocations ?? [])
            .map((a) => a.invoice?.invoice_number)
            .filter((n): n is number => n != null);
          // Credits applied before per-invoice allocations were recorded only
          // carry the single invoice_id on the credit itself.
          const numbers =
            allocNumbers.length > 0
              ? allocNumbers
              : applied > 0 && r.invoice?.invoice_number != null
                ? [r.invoice.invoice_number]
                : [];
          return {
            payment_date: r.payment_date,
            reference: r.reference ?? "",
            account_number: r.clients?.account_number ?? "",
            client_name: clientLabel(r.clients),
            memo: r.memo ?? "",
            applied_invoices: [...new Set(numbers)].sort((a, b) => a - b).map((n) => `#${n}`).join(", "),
            amount_cents: amount,
            applied_cents: applied,
            unapplied_cents: unapplied,
          };
        })
        .filter((r) =>
          params.unapplied === "yes"
            ? r.unapplied_cents > 0
            : params.unapplied === "no"
              ? r.unapplied_cents <= 0
              : true
        );

      return buildResult(
        [
          col("payment_date", "Credit Date", "date"),
          col("reference", "Reference #"),
          col("account_number", "Account #"),
          col("client_name", "Client"),
          col("memo", "Description"),
          col("applied_invoices", "Applied To Invoices"),
          col("amount_cents", "Credit Amount", "money"),
          col("applied_cents", "Applied", "money"),
          col("unapplied_cents", "Unapplied Balance", "money"),
        ],
        rows,
        [
          "Account credits only (payments recorded as a credit) — cash payments, prepayments and AR write-offs are not listed. Date is the credit's date.",
          "Applied is the credit amount less its unapplied balance (and any refund); Applied To Invoices lists the invoices the credit was allocated to.",
          "Unapplied Balance is what is still on account for this client and will reduce a future invoice.",
        ]
      );
    },
  },
  {
    key: "invoiced-products",
    section: "revenue",
    name: "Invoiced Products Report",
    description:
      "Shows invoices that billed one or more products to the client — invoice date and number, product, quantity, price per unit, total, and the invoice's sales rep.",
    filters: [
      dateRangeFilterDef("Invoice Date", "this_month"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
      { key: "product", label: "Product", type: "select", optionsSource: "products" },
    ],
    notes: [
      "Product lines only — lines billed from a product on a job (the product's catalog entry). Service lines and Other Charges are not listed.",
      "Excludes line items on draft and void invoices.",
      "Total is quantity × price per unit, before any line-level discount. Sales Rep is the rep on the invoice.",
    ],
    analysis: (params, timeZone) => ({
      dataset: "rpt_invoice_line_items",
      columns: [
        "invoice_date",
        "invoice_number",
        "client_name",
        "product_name",
        "qty",
        "rate_cents",
        "total_cents",
        "sales_rep",
      ],
      filters: [
        { column: "is_product", op: "eq", value: true },
        ...issuedInvoiceFilter(),
        ...dateRangeFilters("invoice_date", params, timeZone),
        ...eqFilter("sales_rep", params.sales_rep),
        ...eqFilter("product_name", params.product),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "invoice_date",
      sortDir: "desc",
    }),
  },
  {
    key: "won-estimates-service-products",
    section: "estimates",
    name: "Won Estimates Service Products Report",
    description:
      "Shows the products attached to services on accepted and invoiced estimates — estimate value, service, product, quantity, price, and total.",
    filters: [
      dateRangeFilterDef("Estimate Date", "this_year"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
      { key: "service", label: "Service", type: "select", optionsSource: "services" },
      { key: "product", label: "Product", type: "select", optionsSource: "products" },
    ],
    run: async ({ supabase, params, timeZone }) => {
      const { from, to } = resolveDateRange(params, "this_year", timeZone);

      // Product filter: match the catalog entry by name (the option list is
      // catalog names) or, for a product since renamed, the name the estimate
      // line saved.
      let productIds: Set<string> | null = null;
      if (params.product) {
        const ids = await fetchAllRows<{ id: string }>(() =>
          supabase.from("product_items").select("id").eq("name", params.product).is("deleted_at", null)
        );
        productIds = new Set(ids.map((p) => p.id));
      }

      const data = await fetchAllRows<EstimateProductRow>(() => {
        let query = supabase
          .from("estimate_line_item_subitems")
          .select(
            "name, product_id, qty, rate_cents, total_cents, " +
              "estimate_line_items:line_item_id!inner(service_name, " +
              "estimates:estimate_id!inner(estimate_number, estimate_date, subtotal_cents, discount_cents, " +
              "clients:client_id(display_name, deleted_at), " +
              "sales_rep:crm_employees!estimates_sales_rep_id_fkey(first_name, last_name)))"
          )
          .eq("type", "product")
          .is("deleted_at", null)
          .is("estimate_line_items.deleted_at", null)
          // Same "won" rule as Accepted Estimates by Service: accepted or
          // invoiced estimates, excluding lines the client declined (lost).
          .neq("estimate_line_items.status", "lost")
          .is("estimate_line_items.estimates.deleted_at", null)
          .in("estimate_line_items.estimates.stage", ["accepted", "invoiced"]);
        if (from) query = query.gte("estimate_line_items.estimates.estimate_date", from);
        if (to) query = query.lte("estimate_line_items.estimates.estimate_date", to);
        if (params.service) query = query.eq("estimate_line_items.service_name", params.service);
        return query;
      });

      const rows = data
        .filter((r) => r.estimate_line_items?.estimates)
        .filter(
          (r) =>
            !productIds ||
            (r.product_id != null && productIds.has(r.product_id)) ||
            r.name === params.product
        )
        .map((r) => {
          const line = r.estimate_line_items!;
          const est = line.estimates!;
          return {
            estimate_date: est.estimate_date,
            estimate_number: est.estimate_number,
            client_name: clientLabel(est.clients),
            sales_rep: personName(est.sales_rep),
            // Subtotal after the estimate-level discount, before tax (what
            // recalcEstimateTotals stores as revenue_cents).
            estimate_value_cents: Math.max(0, (est.subtotal_cents ?? 0) - (est.discount_cents ?? 0)),
            service_name: line.service_name ?? "",
            product_name: r.name ?? "",
            qty: Number(r.qty ?? 0),
            rate_cents: r.rate_cents ?? 0,
            total_cents: r.total_cents ?? 0,
          };
        })
        .filter((r) => !params.sales_rep || r.sales_rep === params.sales_rep)
        .sort(
          (a, b) =>
            (b.estimate_date ?? "").localeCompare(a.estimate_date ?? "") ||
            (b.estimate_number ?? 0) - (a.estimate_number ?? 0) ||
            a.service_name.localeCompare(b.service_name) ||
            a.product_name.localeCompare(b.product_name)
        );

      return buildResult(
        [
          col("estimate_date", "Estimate Date", "date"),
          col("estimate_number", "Estimate #", "number", false),
          col("client_name", "Client"),
          col("sales_rep", "Sales Rep"),
          col("estimate_value_cents", "Estimate Value", "money", false),
          col("service_name", "Service"),
          col("product_name", "Product"),
          col("qty", "Qty", "number", false),
          col("rate_cents", "Price", "money", false),
          col("total_cents", "Product Total", "money"),
        ],
        rows,
        [
          "Won = accepted or invoiced estimates, dated by the estimate date (the same rule as Accepted Estimates by Service). Lines the client declined (line status = lost) are excluded.",
          "One row per product attached to a service line. Estimate Value is the whole estimate's subtotal after discounts and before tax; it repeats on each of the estimate's rows and is not totalled.",
          "Product Total is quantity × price for that product as quoted on the estimate.",
        ]
      );
    },
  },
  {
    key: "resource-time-utilization",
    section: "job_hours",
    name: "Resource Time Utilization",
    description:
      "Breaks down each crew member's day into time on services, drive time, shop/other paid time and unpaid breaks — hours, share of the total, and labor cost for each.",
    filters: [
      dateRangeFilterDef("Worked Between", "this_month"),
      { key: "resource", label: "Resource", type: "select", optionsSource: "crewMembers" },
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
      { key: "period", label: "Break Down By", type: "select", options: UTILIZATION_PERIOD_OPTIONS },
    ],
    run: async ({ supabase, params, timeZone }) => {
      const { from, to } = resolveDateRange(params, "this_month", timeZone);
      if (!from || !to) throw new Error("Pick a date range with both a start and an end date.");
      if (daysBetweenYmd(from, to) < 0) throw new Error("The start date is after the end date.");
      if (daysBetweenYmd(from, to) > MAX_UTILIZATION_DAYS) {
        throw new Error(`Pick a range of at most ${MAX_UTILIZATION_DAYS} days.`);
      }
      // The org comes from the session (my_org_id(), impersonation-aware) — never a param.
      const orgId = await getEffectiveOrgId(supabase);
      if (!orgId) throw new Error("Could not resolve your organization.");

      // Paid day (Start Day → End Day shift), job punch hours and unpaid
      // break minutes per member per day — exactly the Payroll tab's figures.
      const payroll = (await computePayroll(supabase, orgId, from, to)).filter(
        (r) =>
          (!params.resource || r.memberName === params.resource) &&
          (!params.crew || r.crewName === params.crew)
      );

      // Drive time is recorded per crew per day (crm_crew_drive_segments).
      const [drive, crews] = await Promise.all([
        fetchAllRows<{ crew_id: string; work_date: string; minutes: number | null }>(() =>
          supabase
            .from("crm_crew_drive_segments")
            .select("crew_id, work_date, minutes")
            .gte("work_date", from)
            .lte("work_date", to)
            .not("ended_at", "is", null)
        ),
        fetchAllRows<{ id: string; name: string | null }>(() => supabase.from("crm_crews").select("id, name")),
      ]);
      const crewNameById = new Map(crews.map((c) => [c.id, c.name ?? ""]));
      const driveMinutesByCrewDay = new Map<string, number>();
      for (const d of drive) {
        const k = `${crewNameById.get(d.crew_id) ?? ""}|${d.work_date}`;
        driveMinutesByCrewDay.set(k, (driveMinutesByCrewDay.get(k) ?? 0) + Math.max(0, Number(d.minutes ?? 0)));
      }

      // Job-costing labor rate per member — the one rule (crm_crew_member_labor_rates:
      // the member's burden rate, else the employee's hourly rate × the org's labor
      // burden), the same rate rpt_timesheets and job costing use. Rates are only
      // returned to Show Wage Burden holders; everyone else gets the hours without cost.
      const { data: canSeeCost } = await supabase.rpc("has_settings_permission", { p_key: "payroll_show_wage_burden" });
      const showCost = canSeeCost === true;
      const memberIds = [...new Set(payroll.map((r) => r.crewMemberId))];
      const rateByMember = new Map<string, number>();
      if (showCost) {
        for (let i = 0; i < memberIds.length; i += 200) {
          const { data: rates, error: ratesErr } = await supabase.rpc("crm_crew_member_labor_rates", { p_member_ids: memberIds.slice(i, i + 200) });
          if (ratesErr) throw new Error(ratesErr.message);
          for (const m of (rates ?? []) as { crew_member_id: string; rate_cents: number | null }[]) {
            rateByMember.set(m.crew_member_id, Number(m.rate_cents ?? 0));
          }
        }
      }

      interface Bucket { hours: number; cost: number }
      const emptyBuckets = (): Record<TimeTypeKey, Bucket> => ({
        services: { hours: 0, cost: 0 },
        drive: { hours: 0, cost: 0 },
        shop: { hours: 0, cost: 0 },
        breaks: { hours: 0, cost: 0 },
      });
      const groups = new Map<string, { resource: string; periodKey: string; periodLabel: string; b: Record<TimeTypeKey, Bucket> }>();
      let openShiftDays = 0;
      let noShiftDays = 0;
      let openPunches = 0;
      const noRateResources = new Set<string>();

      for (const r of payroll) {
        const rate = rateByMember.get(r.crewMemberId) ?? 0;
        const driveH = (driveMinutesByCrewDay.get(`${r.crewName ?? ""}|${r.workDate}`) ?? 0) / 60;
        let services: number;
        let drivePart: number;
        let shop: number;
        let breaks: number;
        if (r.shiftStart && r.shiftEnd) {
          const spanH = Math.max(0, (new Date(r.shiftEnd).getTime() - new Date(r.shiftStart).getTime()) / 3_600_000);
          breaks = Math.min(r.breakMinutes / 60, spanH);
          const paid = r.shiftHours;
          services = Math.min(r.jobHours, paid);
          const nonJob = Math.max(0, paid - services);
          drivePart = Math.min(driveH, nonJob);
          shop = nonJob - drivePart;
        } else {
          if (r.openShift) openShiftDays += 1;
          else noShiftDays += 1;
          services = r.jobHours;
          breaks = r.breakMinutes / 60;
          drivePart = driveH;
          shop = 0;
        }
        openPunches += r.openPunches;
        if (services + drivePart + shop + breaks <= 0) continue;
        if (showCost && rate <= 0) noRateResources.add(r.memberName);

        const p = periodOf(r.workDate, params.period ?? "");
        const gk = `${r.memberName}|${p.key}`;
        const g = groups.get(gk) ?? { resource: r.memberName, periodKey: p.key, periodLabel: p.label, b: emptyBuckets() };
        g.b.services.hours += services;
        g.b.services.cost += services * rate;
        g.b.drive.hours += drivePart;
        g.b.drive.cost += drivePart * rate;
        g.b.shop.hours += shop;
        g.b.shop.cost += shop * rate;
        // Unpaid time off the clock carries no labor cost.
        g.b.breaks.hours += breaks;
        groups.set(gk, g);
      }
      const showPeriod = !!params.period;
      const rows = [...groups.values()]
        .sort((a, b) => a.resource.localeCompare(b.resource) || a.periodKey.localeCompare(b.periodKey))
        .flatMap((g) => {
          const totalH = TIME_TYPES.reduce((s, t) => s + g.b[t.key].hours, 0);
          return TIME_TYPES.map((t) => ({
            resource: g.resource,
            ...(showPeriod ? { period: g.periodLabel } : {}),
            time_type: t.label,
            minutes: Math.round(g.b[t.key].hours * 60),
            hours: r2(g.b[t.key].hours),
            pct_of_total: totalH > 0 ? Math.round((g.b[t.key].hours / totalH) * 1000) / 10 : 0,
            ...(showCost ? { cost_cents: Math.round(g.b[t.key].cost) } : {}),
          }));
        });

      const flags: string[] = [];
      if (openShiftDays > 0) {
        flags.push(`${openShiftDays} member-day(s) have a shift that was never ended — only their job and drive time is counted until End Day is recorded or the Payroll tab corrects it.`);
      }
      if (noShiftDays > 0) {
        flags.push(`${noShiftDays} member-day(s) have no Start Day / End Day shift — those days count job punches and recorded drive time only, so shop time is not measured.`);
      }
      if (openPunches > 0) {
        flags.push(`${openPunches} job punch(es) are still clocked in and are not counted.`);
      }
      if (showCost && noRateResources.size > 0) {
        flags.push(`No labor rate is set for: ${[...noRateResources].sort().join(", ")} (no burden rate on the crew member and no hourly rate on the employee) — their cost shows as $0.`);
      }
      if (!showCost) {
        flags.push("Cost is hidden: it needs the Show Wage Burden permission.");
      }

      const result = buildResult(
        [
          col("resource", "Resource"),
          ...(showPeriod ? [col("period", "Period")] : []),
          col("time_type", "Time Type"),
          col("minutes", "Minutes", "number", true),
          col("hours", "Hours", "hours"),
          col("pct_of_total", "% of Total", "percent"),
          ...(showCost ? [col("cost_cents", "Cost", "money")] : []),
        ],
        rows,
        [
          "Total time is the member's day from Start Day to End Day (the Payroll tab's shift, including office corrections to start/end/break), split into the four types below. Payroll-only hour overrides and extra hours are not applied.",
          "Time on Services: the member's job punches (clock-in/out on stops), net of their own breaks/lunch and their share of unpaid stop pauses — the same hours Job Costing and the Timesheet use, capped at the paid shift.",
          "Drive Time: drive segments recorded by the member's crew that day (yard to first stop, between stops, last stop to yard). Drive is recorded per crew, not per person, so every member working on that crew that day is credited with the crew's full drive time, capped at the shift time not spent on jobs.",
          "Shop / Other Paid Time: the rest of the paid shift — shop, loading, unrecorded driving or waiting.",
          "Breaks & Lunch (unpaid): unpaid time off the clock inside the day — the shift's recorded break, lunch/breaks on job punches, and unpaid stop pauses. Paid pauses stay inside Time on Services. Breaks carry no cost.",
          "Cost is hours × the crew member's labor rate per hour: the burden rate on the crew member record, else the employee's hourly rate plus the company labor burden — the same rate the Timesheet report and job costing use. % of Total is each type's share of that resource's total for the period.",
          "Break Down By = All shows the whole date range as one period per resource.",
          ...flags,
        ],
        "resource"
      );
      return { ...result, groupSubtotals: true };
    },
  },
];
