import {
  DocsFontScope,
  DocsHero,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

interface ReportRow {
  name: string;
  description: string;
  filters?: string;
  notes?: string[];
  fullPage?: boolean;
}

interface ReportSection {
  id: string;
  label: string;
  reports: ReportRow[];
}

// Sourced from the report definitions in src/lib/reports/definitions/*.ts —
// each report's `description` and `notes` fields verbatim, plus its
// user-facing filters. Keep this in sync when a report definition changes;
// see the Report Center guide for how the underlying engine works.
const SECTIONS: ReportSection[] = [
  {
    id: "service",
    label: "Service Reports",
    reports: [
      {
        name: "Visits Report",
        description: "Shows all visits in any defined time frame with hours, revenue, and location detail.",
        filters: "Scheduled Between, Status, Crew, Service Zip",
        notes: ["Budgeted Man-Hours and Actual Man-Hours are both duration × number of men."],
      },
      {
        name: "Backlog Services",
        description: "Shows scheduled visits that have not been completed as of a cutoff date.",
        filters: "Scheduled On or Before",
        notes: ["Visits still in Scheduled or Dispatched status on or before the cutoff — work waiting to be started."],
      },
      {
        name: "Client Count by Service",
        description: "Shows how many clients receive each service and the share of the client base.",
      },
      {
        name: "Client Services Report",
        description: "Shows the active services each client is signed up for.",
        filters: "Job Type",
      },
      {
        name: "Package Summary Report",
        description: "Shows visit progress and earned vs pending revenue for each service package.",
        notes: [
          "Counts visits, not jobs. Total Visits counts every visit on each package job, cancelled included; Completed counts visits in Completed status; Cancelled counts cancelled visits; Remaining is Total − Completed − Cancelled.",
          "Earned is completed visits × the per-visit amount — the visit's own rate × qty when set, otherwise the job total split evenly across its non-cancelled visits. Pending is the job total minus Earned. A package job with no visits generated yet shows entirely as Pending.",
        ],
      },
      {
        name: "Skipped Visits Report",
        description: "Shows visits that were skipped in any defined time frame, with the reason.",
        filters: "Scheduled Between",
      },
      {
        name: "Custom Package Renewal Report",
        description: "A list of packages with a renewal setting, ready to renew.",
      },
      {
        name: "Over / Under Report",
        description: "Contract budgeted-to-date vs. invoiced-to-date revenue for each active contract.",
        notes: [
          "Budgeted to Date sums the contract's monthly amounts from the start month through today (or the contract end).",
          "Over / (Under) is invoiced-to-date minus budgeted-to-date.",
          "A contract that starts mid-month is still credited a full month's budget for that first month.",
        ],
      },
      {
        name: "Product and Service Usage",
        description: "Shows quantity and amount for each service across three stages: Estimate, Job, and Invoice.",
        notes: [
          "Amounts exclude sales tax. Job amount is line qty × rate on the job's service lines (the sold template), not per-visit delivery — for a recurring job this is a single snapshot, not a sum across every visit, so it won't reconcile 1:1 against Invoiced Amount.",
          "Excludes deleted estimates/jobs/invoices, cancelled jobs, and draft or void invoices.",
        ],
      },
      {
        name: "Revenue and Budgeted Hours Projection",
        description: "Projects budgeted man hours and revenue for the next 12 months from currently scheduled visits.",
        notes: [
          "Based on visits currently in Scheduled or Dispatched status from today through the next 365 days (Eastern calendar dates).",
          "Budgeted Man-Hours are duration × number of men.",
        ],
      },
      {
        name: "Chemical Tracking Report",
        description: "Post-application compliance record of chemicals actually applied — date, EPA #, quantities, conditions, applicator, and license number.",
        filters: "Applied Between",
        notes: [
          "Only chemicals marked as applied (Used) are included — planned applications that were never made are excluded. Service Date is the date the visit was actually worked when the application is tied to a visit.",
          "Applicator Name populates whenever an applicator is assigned to the application. Applicator License Number only populates if that employee had a license on file at the time. Application Start/End Time populate only when entered on the application record, independent of licensing.",
          "Chemical Amount is the concentrate used; Solution Amount is the total mixed solution actually applied.",
        ],
      },
      {
        name: "Planned Chemical Usage Report",
        description: "Chemical quantities needed for scheduled and dispatched (not-yet-started) visits — use to load the truck before the day's chemical jobs.",
        filters: "Scheduled Between",
        notes: ["Includes visits in Scheduled or Dispatched status only; in-progress and completed visits are excluded."],
      },
      {
        name: "Materials Needed for Upcoming Jobs",
        description: "For every product (chemical or general material): quantity needed for outstanding scheduled and waiting-list jobs, amount on hand, amount on order, and the resulting shortfall — with the ability to create a Requisition or PO directly from a shortfall.",
        notes: [
          "Chemical quantities require an Area Custom Field under Settings > Chemical Tracking and a default Application Rate on the product. General materials come from each job's Products section.",
          "Amount on Order sums line-item quantities on open Requisitions (pending approval/approved) and Purchase Orders (requested through partially fulfilled) for that product, less any quantity already received against those PO lines.",
          "Demand counts visits in Scheduled, Dispatched, or In Progress status, plus waiting-list jobs that have not been dispatched yet. Only job products still marked Pending count — products already marked Invoiced or Used are excluded, since their quantity has already come out of on-hand.",
        ],
        fullPage: true,
      },
      {
        name: "Contract Service Usage",
        description: "Shows bundled services included on each contract (e.g. 25 mowings) against actual completed visits, so you can see which contracts are running over.",
        filters: "Contract Status, Only show over-included",
        notes: [
          "Visits used counts a completed visit only if it's linked to a job service matching this bundled service — same logic as the Included Services tab on the contract.",
        ],
      },
    ],
  },
  {
    id: "client",
    label: "Client",
    reports: [
      {
        name: "Client Balance",
        description: "Shows the clients that owe you and how much.",
        filters: "Where Balance Greater Than ($)",
        notes: ["Balance is the client's Account Balance — issued invoices only. Draft invoices are not included; they appear on the Income Not Invoiced report instead."],
      },
      {
        name: "Client Contact List",
        description: "Shows a client contact list with the ability to sort by account balance and sales rep.",
        filters: "Sales Rep, Sort By",
      },
      {
        name: "Client Phone List",
        description: "Shows clients and their phone numbers, filterable by sales rep.",
        filters: "Client Since, Sales Rep",
      },
      {
        name: "Client Method of Payment",
        description: "Shows if a client typically pays by check or card.",
        filters: "Client Type, Payment Method",
      },
      {
        name: "Client Referral",
        description: "Shows word-of-mouth referrals — who referred each client.",
        filters: "Client Since",
      },
      {
        name: "New Clients Report",
        description: "Shows new clients in any defined time frame.",
        filters: "Client Since, Sales Rep",
      },
      {
        name: "Terminations Report",
        description: "Shows a list of clients who cancelled service, the date, and reason stated.",
        filters: "Cancelled Between, Reason Contains",
      },
      {
        name: "Cancellation Count Report",
        description: "Shows how many cancellations occurred, broken down by reason, source, and sales rep.",
        filters: "Cancelled Between",
      },
      {
        name: "New Client Count Report",
        description: "Shows new clients grouped by postal code, source, and sales rep.",
        filters: "Client Since",
      },
      {
        name: "Clients Report by Completed Visits",
        description: "Shows which clients were served in any defined time frame — completed visits, revenue, and man-hours per client.",
        filters: "Completed Between",
        notes: ["Formerly \"Clients Report by Completed Jobs.\" Counts completed visits (a recurring job contributes one row per completed visit), not distinct jobs."],
      },
      {
        name: "Client Contracts",
        description: "Shows a single-line summary of all client contracts including billing day and monthly amounts.",
        filters: "Contract Start Between, Active Only",
        notes: ["Monthly columns use the contract's per-month schedule when set, otherwise the flat monthly amount."],
      },
      {
        name: "Clients/Leads Monthly Matrix",
        description: "New clients, new leads, conversion rate, and terminations for the last 3 months.",
        notes: [
          "New Leads = accounts created in the month (any current status). Converted = accounts whose Client Since date falls in the month and that are/were clients. Conversion % = Converted ÷ New Leads.",
        ],
      },
      {
        name: "Clients and Leads",
        description: "New leads, converted leads, average days to convert, and cancellations for a date range, plus current totals.",
        filters: "Date Range",
        notes: [
          "New Leads = accounts created in range that are still leads (open or lost). Converted Leads = accounts whose Client Since date falls in range. Avg Days to Convert = created → Client Since, over converted accounts whose Client Since is after their created date (accounts created directly as clients are excluded). Total Clients = active + inactive + cancelled; Total Leads = open leads only.",
        ],
      },
    ],
  },
  {
    id: "revenue",
    label: "Revenue",
    reports: [
      {
        name: "Invoice Audit Summary",
        description: "Shows every invoice line item in the period — what was billed, to whom, and for how much.",
        filters: "Invoice Date",
        notes: ["Excludes line items on draft and void invoices."],
      },
      {
        name: "Payment Audit Summary",
        description: "Shows payments received per day, broken out by payment method.",
        filters: "Payment Date",
        notes: ["Cash only: excludes account credits and AR write-offs; amounts are net of refunds."],
      },
      {
        name: "Credit Card Processing Fees",
        description: "Processing fees collected from clients on card payments — this is company revenue, tracked separately from the invoice amount it was collected alongside.",
        filters: "Payment Date",
        notes: [
          "Only card payments carry a fee — ACH payments are always fee-free by design.",
          "A fee of $0 on a card payment means the fee was waived or the balance was under the settings threshold.",
          "Cash only: excludes account credits and AR write-offs; Payment Amount is net of refunds.",
        ],
      },
      {
        name: "Revenue by Postal Code",
        description: "Totals invoiced revenue by billing postal code.",
        filters: "Invoice Date",
        notes: ["Excludes draft and void invoices."],
      },
      {
        name: "Revenue by Service Summary",
        description: "Shows invoiced revenue per service line item, broken out by month.",
        filters: "Invoice Date",
        notes: ["Revenue is reported on the invoice date. Draft and void invoices are excluded."],
      },
      {
        name: "Daily Production",
        description: "Shows completed visits with budgeted vs actual hours, man-hours, and revenue.",
        filters: "Completed Between, Crew",
      },
      {
        name: "Sales Activity Summary",
        description: "Totals completed-visit revenue and man-hours by sales rep.",
        filters: "Completed Between",
      },
      {
        name: "Sales Activity Detail",
        description: "Shows which sales rep sold what service and to whom, with per-visit revenue detail.",
        filters: "Completed Between, Sales Rep",
      },
      {
        name: "Approved Sales by Sales Rep",
        description: "Totals sold jobs per sales rep — job count, service, product, and job totals.",
        filters: "Date Sold",
        notes: ["Based on the job's Date Sold."],
      },
      {
        name: "Sales by Date Sold (Detail)",
        description: "Shows each job sold in the period with its services, sales rep, source, and total.",
        filters: "Date Sold, Sales Rep",
      },
      {
        name: "Invoices and Payments",
        description: "Compares invoiced revenue to payments collected, month by month.",
        filters: "Date Range",
        notes: ["Invoiced reflects the invoice date and excludes draft and void invoices. Collected reflects the payment date and is cash only — excludes account credits and AR write-offs; net of refunds."],
      },
      {
        name: "Credit Card Charges",
        description: "Shows credit card payments received, including processing fees where applicable.",
        filters: "Payment Date",
      },
    ],
  },
  {
    id: "schedule-lists",
    label: "Schedule Lists",
    reports: [
      {
        name: "Employee Directory",
        description: "Shows employee contact info, employment status, and emergency contacts.",
        filters: "Active Only",
      },
      {
        name: "Contractor Phone List",
        description: "Shows contact info for everyone with contractor employment status.",
      },
      {
        name: "Vendor Contact List",
        description: "Shows vendors and subcontractors with their contact information.",
      },
      {
        name: "Inventory Product List",
        description: "Shows inventory products with cost, price, and stock levels.",
      },
      {
        name: "Non-Inventory Product List",
        description: "Shows non-inventory products with cost and price.",
      },
      {
        name: "Call Ahead Required",
        description: "Scheduled jobs that require a call-ahead reminder before the crew arrives.",
      },
      {
        name: "Service Price List",
        description: "Shows the service catalog with rates, production rates, and targets.",
        filters: "Active Only",
      },
      {
        name: "Paused Services",
        description: "Shows jobs that have been placed on hold.",
      },
    ],
  },
  {
    id: "job-costing",
    label: "Job Costing",
    reports: [
      {
        name: "Job Costing Report",
        description: "Shows the material and labor cost of each job with budget vs actual detail.",
        notes: [
          "Built per completed visit whose completion date falls in the window. Revenue is the visit's service rate; labor is the crew's clock-out labor cost when one was recorded, otherwise estimated as man-hours × the crew's average labor burden rate and marked with a dagger (†); materials are the job materials logged against the visit.",
          "All hours are man-hours (crew hours × number of men).",
        ],
        fullPage: true,
      },
      {
        name: "Cost of Goods Sold Report",
        description: "Shows revenue and cost by service in any defined time frame.",
        notes: [
          "Built from the same per-completed-visit costing as the Job Costing Report. A visit with several services is split across them by each service's share of the visit's man-hours.",
          "Labor marked with a dagger (†) was estimated as man-hours × crew labor burden because no crew clock-out recorded actual labor.",
        ],
        fullPage: true,
      },
      {
        name: "Job Cost Summary",
        description: "Shows completed visits with budgeted vs actual man-hours, revenue, and labor cost per visit.",
        filters: "Completed Between, Crew",
        notes: ["Budgeted and Actual Man-Hours are both duration × number of men."],
      },
      {
        name: "Service Profitability Summary",
        description: "Shows visit count, revenue, labor cost, and man-hours grouped by service.",
        filters: "Completed Between",
        notes: ["Visits with multiple services are grouped by the combined service list."],
      },
      {
        name: "Production Rate Accuracy",
        description: "Compares each service's assumed production rate (sq ft per man-hour) against what crews actually achieved, to flag rates that need recalibrating.",
        filters: "Scheduled Between",
        notes: [
          "Only includes services set to the 'production rate' budget method — manual-rate services have nothing to compare against.",
          "One row per completed visit × service — the filter is on the visit's own status. A recurring job's visits still in progress or not yet done are excluded, even if the job itself is marked complete.",
          "Rate Variance is actual vs. assumed, as a percentage. Negative means the job took longer than the assumed rate predicted (the rate may be set too aggressively); positive means it went faster (the rate may be too conservative).",
        ],
      },
      {
        name: "WIP Report",
        description: "Work-in-progress schedule for Projects: percent complete by cost-to-cost, earned revenue, and whether each job is over- or under-billed.",
        filters: "Status",
        notes: [
          "% Complete is cost-to-date ÷ EAC (estimated cost at completion) — not the manual progress field on the project.",
          "Over/(Under) Billed is billed to date minus earned revenue. Positive means billings are ahead of the work (healthy); negative means the work is ahead of billing (you're financing the job).",
          "EAC is seeded from the linked estimate when a job is converted, then re-forecastable on the project — projects with no EAC set show 0% complete.",
          "Cost to Date counts PO and requisition lines assigned to the project, excluding draft and rejected POs and requisitions. Billed to Date counts issued (not draft or void) invoices, before tax.",
        ],
      },
    ],
  },
  {
    id: "financial",
    label: "Financial",
    reports: [
      {
        name: "Invoiced Income by Client",
        description: "Totals invoiced income per client — subtotal, tax, total, and amount paid.",
        filters: "Invoice Date",
        notes: ["Excludes draft and void invoices."],
      },
      {
        name: "Invoices with Balances",
        description: "Shows every open invoice with a balance due and how many days overdue it is.",
        filters: "Invoice Date",
        notes: ["Excludes draft and void invoices — only issued invoices are receivables."],
      },
      {
        name: "Pre-Payments",
        description: "Shows prepayments received, how much has been applied, and what remains.",
        filters: "Payment Date",
        notes: ["Cash only: excludes account credits and AR write-offs. Applied Amount is net of refunds."],
      },
      {
        name: "Profit / Loss — Accrual Basis",
        description: "Income by invoiced line item (accrual basis) less job material and field labor costs.",
        filters: "Date Range",
        notes: [
          "Accrual basis: income is counted on the invoice date regardless of when payment is received. Draft and void invoices are excluded.",
          "Expenses include job material costs (by purchase date) and field labor costs (by visit completion). Overhead and non-job expenses are not included.",
        ],
      },
      {
        name: "Profit / Loss — Cash Basis",
        description: "Income by payments received (cash basis) less job material and field labor costs.",
        filters: "Date Range",
        notes: [
          "Cash basis: income is counted when payment is received, not when work is invoiced. Cash only: excludes account credits and AR write-offs; net of refunds.",
          "Credit card processing fees are the surcharge collected from clients on card payments (never on ACH) — separate from the invoice amount itself.",
          "Expenses include job material costs (by purchase date) and field labor costs (by visit completion). Overhead and non-job expenses are not included.",
        ],
      },
      {
        name: "Sales Tax Report",
        description: "Shows taxable, non-taxable, and collected sales tax totals by month.",
        filters: "Invoice Date",
        notes: ["Tax is reported on invoice date (accrual). Excludes draft and void invoices."],
      },
    ],
  },
  {
    id: "audits",
    label: "Audits",
    reports: [
      {
        name: "Client Timeline Report",
        description: "Shows every activity on client accounts — notes, calls, emails, invoices, payments, and visits.",
        filters: "Date Range, Activity Type, Client Name",
      },
      {
        name: "Lead Timeline Report",
        description: "Shows every activity on lead accounts — notes, calls, emails, and estimates.",
        filters: "Date Range, Activity Type, Lead Name",
      },
      {
        name: "Income Not Invoiced",
        description: "Shows draft invoices — revenue already entered on a job but not yet finalized and sent to the client.",
        filters: "Invoice Date",
        notes: ["Draft invoices only, by invoice date. A row drops off once the invoice is printed, sent, or voided. Completed visits that have not had an invoice created at all do not appear here. This is the only report that shows draft invoices — every revenue and receivables report excludes them."],
      },
      {
        name: "Visits — Client Has Balance Due",
        description: "Shows completed and in-progress visits for clients who still have an outstanding balance.",
        filters: "Visit Date",
        notes: [
          "Completed and in-progress visits only (by scheduled date); amount is the visit rate × qty before tax.",
          "Account Balance is the client's current outstanding balance (issued invoices only), repeated on each of their visits — it is not summed.",
        ],
      },
      {
        name: "Unapplied Payments",
        description: "Shows payments with money still unapplied to an invoice, including prepayments and credits.",
        filters: "Payment Date",
      },
      {
        name: "Sales Commission Export",
        description: "Shows finalized invoices by sales rep for commission calculations, excluding sales tax.",
        filters: "Invoice Date, Sales Rep",
        notes: ["Rows appear once an invoice is finalized (not draft or void), regardless of payment status. Amounts exclude sales tax."],
      },
    ],
  },
  {
    id: "lead",
    label: "Lead",
    reports: [
      {
        name: "New Leads Report",
        description: "Shows new leads received in any defined time frame.",
        filters: "Received Between",
        notes: [
          "Accounts created in the range that started as a lead: still a lead (open or lost), or converted to a client after the day they were created. Accounts created directly as clients are excluded.",
        ],
      },
      {
        name: "Lead Aging Summary",
        description: "Shows how long open leads have been sitting, bucketed by age and source.",
      },
      {
        name: "Closed Leads Summary",
        description: "Shows leads that were closed without converting, grouped by reason.",
        filters: "Closed Between",
        notes: ["Leads closed without ever converting to a client (status = Lost). A lost lead is never counted as a client anywhere in reporting."],
      },
      {
        name: "Company Scorecard",
        description: "Month-by-month view of new leads, conversions, terminations, and running client totals.",
        filters: "Year",
        notes: [
          "New Leads counts accounts created that month, whatever their status is today; totals are as of month end.",
          "Client Total = accounts that had converted (Client Since) by month end, are/were clients, and had not been cancelled by then. Lead Total = accounts created by month end that were still a lead at month end (open, converted later, or lost later).",
        ],
      },
      {
        name: "Sales Summary by Source",
        description: "Shows lead, client, cancellation, and lost-lead counts by source with conversion percentage.",
        notes: [
          "Conversion % = accounts that became clients (Clients + Cancelled) ÷ all accounts from the source (Leads + Clients + Cancelled + Lost).",
        ],
      },
    ],
  },
  {
    id: "estimates",
    label: "Estimates",
    reports: [
      {
        name: "Estimates by Stage",
        description: "Shows all estimates in the pipeline with their stage, value, probability, and age.",
        filters: "Estimate Date, Stage, Sales Rep",
      },
      {
        name: "Accepted Estimates by Service",
        description: "Shows every service line on accepted and invoiced estimates with hours, cost, and value.",
        filters: "Estimate Date, Sales Rep",
        notes: ["Excludes declined line items (line status = lost) — e.g. a tier the client unchecked when accepting in the portal."],
      },
      {
        name: "Accepted Estimates by Service (Summary)",
        description: "Totals accepted and invoiced estimate lines by service — line count, value, hours, and cost.",
        filters: "Estimate Date, Sales Rep",
        notes: ["Excludes declined line items (line status = lost)."],
      },
      {
        name: "Accepted Estimates — Estimated vs Invoiced Value",
        description: "Compares each accepted estimate's value against what was actually invoiced and paid.",
        filters: "Estimate Date",
        notes: ["Invoiced and paid values are summed across all non-void invoices linked to each accepted or invoiced estimate."],
      },
      {
        name: "Close Ratios by Sales Rep",
        description: "Shows each sales rep's win rate by estimate count and by dollar value for a date range.",
        filters: "Estimate Date",
        notes: ["Won = accepted or invoiced. Draft estimates were never presented to a client and are excluded from both counts and amounts. An estimate a client declines in the portal moves to Lost and counts against the ratio."],
      },
      {
        name: "Sales Activity (Last 7 Days)",
        description: "Shows estimates created or sent per day over the last 7 days.",
      },
    ],
  },
  {
    id: "job-hours",
    label: "Job Hours",
    reports: [
      {
        name: "Actual v. Budgeted Hours (Today / Yesterday / Week to Date / Last Week / Month to Date)",
        description: "Five fixed-window variants of the same report: budgeted vs actual hours and revenue for that period's visits, grouped by crew with a subtotal row per crew.",
        notes: [
          "Grouped by crew (Assigned Resources), with a subtotal row per crew.",
          "Only completed and in-progress visits are included — scheduled, dispatched, cancelled, and skipped visits have no actual hours to compare.",
          "Budgeted Hours and Actual Hours are both man-hours (duration × number of men).",
          "Hours Variance is Budgeted Hours minus Actual Hours; negative means the visit ran over budget. It is blank until a visit has actual hours.",
          "The Revenue / Man Hour chart is total revenue ÷ total man-hours per crew (not an average of per-visit rates).",
        ],
      },
      {
        name: "Actual v. Budgeted Hours (Custom Range)",
        description: "The same report as above, but lets you pick any From/To date range instead of a fixed window — defaults to month to date. The five fixed-window variants can also be scheduled for daily PDF email delivery.",
        filters: "Visit Date, Crew",
        notes: [
          "Grouped by crew (Assigned Resources), with a subtotal row per crew.",
          "Only completed and in-progress visits are included — scheduled, dispatched, cancelled, and skipped visits have no actual hours to compare.",
          "Budgeted Hours and Actual Hours are both man-hours (duration × number of men).",
          "Hours Variance is Budgeted Hours minus Actual Hours; negative means the visit ran over budget. It is blank until a visit has actual hours.",
          "The Revenue / Man Hour chart is total revenue ÷ total man-hours per crew (not an average of per-visit rates).",
        ],
      },
      {
        name: "Job Hours Summary",
        description: "Shows total hours worked and labor cost by employee in any defined time frame.",
        filters: "Worked Between",
      },
      {
        name: "Crew Hours Summary",
        description: "Shows total hours worked and labor cost by crew in any defined time frame.",
        filters: "Worked Between",
      },
      {
        name: "Timesheet Detail",
        description: "Shows individual clock-in/out entries with breaks, hours, and labor cost per employee.",
        filters: "Worked Between, Crew",
      },
    ],
  },
  {
    id: "receivables",
    label: "Receivables",
    reports: [
      {
        name: "A/R Aging Report",
        description: "Buckets each client's open invoice balances by how many days past due they are.",
        notes: [
          "Reflects invoices open today — not a point-in-time snapshot.",
          "Excludes draft and void invoices — only issued invoices are receivables.",
        ],
      },
      {
        name: "A/R Aging Snapshot",
        description: "Shows each client's outstanding balance alongside their most recent invoice and payment.",
        filters: "Where Balance Greater Than ($)",
        notes: ["Outstanding balance and Last Invoice exclude draft and void invoices. Last Payment is cash only — excludes account credits and AR write-offs."],
      },
    ],
  },
  {
    id: "forms",
    label: "Forms",
    reports: [
      {
        name: "Forms Summary",
        description: "Shows forms and the number of responses received in any given time frame.",
        filters: "Responses Between",
        notes: ["Responses marked Spam or Ignored are not counted. Date bounds are calendar days in Eastern time."],
      },
    ],
  },
];

export default function ReportsReferenceGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Reporting"
        title="Reports Reference"
        description="What every report in the Report Center actually measures, its available filters, and the gotchas worth knowing before you trust the numbers — one level deeper than the catalog's one-line description."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          {SECTIONS.map((section) => (
            <TOCLink key={section.id} href={`#${section.id}`}>
              {section.label}
            </TOCLink>
          ))}
        </div>
      </div>

      <Callout>
        This is a reference, not a how-to — for how the Report Center itself works (running a
        report, saving a custom analysis, building a dashboard), see the{" "}
        <a href="/settings/support/report-center-guide" className="font-semibold underline">
          Report Center &amp; Dashboards guide
        </a>
        . A row marked <strong>Full page</strong> below opens as its own dedicated report page
        rather than the generic filter-and-table view every other report uses.
      </Callout>

      <Callout>
        <strong>Three rules apply to every report, dashboard, and KPI on this page</strong> unless a
        row says otherwise:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Issued-invoice rule.</strong> Only issued invoices count — Draft and Void
            invoices are excluded from every revenue and receivables figure. The single exception is{" "}
            <strong>Income Not Invoiced</strong>, which exists to list drafts. A client&apos;s Account
            Balance follows the same rule; drafts show separately as the Uninvoiced balance.
          </li>
          <li>
            <strong>Cash rule.</strong> Payment reports and every &quot;Collected&quot; or
            &quot;Payments&quot; figure count cash actually received: account credits and{" "}
            <strong>AR Write-off</strong> entries are excluded, and amounts are net of refunds.
          </li>
          <li>
            <strong>Eastern time.</strong> Every date and time filter (Today, Month to Date, a custom
            From/To, a bare date) is evaluated on Eastern calendar days, and hours columns on
            visit-based reports are man-hours (crew hours × number of men).
          </li>
        </ul>
      </Callout>

      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-6 rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
            {section.label}
          </h2>
          <Table>
            <thead>
              <TableHeadRow>
                <th className="w-56 px-3 py-2">Report</th>
                <th className="px-3 py-2">What it shows</th>
                <th className="w-48 px-3 py-2">Filters</th>
              </TableHeadRow>
            </thead>
            <tbody>
              {section.reports.map((report) => (
                <tr key={report.name} className="border-b border-[#eceae3] align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-[#0a0a0a]">
                    {report.name}
                    {report.fullPage && (
                      <span className="ml-2 inline-flex rounded-full bg-[#eef4e2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#396927]">
                        Full page
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[#4a4a46]">
                    <p>{report.description}</p>
                    {report.notes && report.notes.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#6a6a66]">
                        {report.notes.map((note, i) => (
                          <li key={i}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[#6a6a66]">{report.filters ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ))}
    </DocsFontScope>
  );
}
