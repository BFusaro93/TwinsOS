import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const SECTIONS: [string, number, string][] = [
  ["Service Reports", 13, "Visits Report, Backlog Services, Client Count by Service, Client Services Report, Package Summary Report, Skipped Visits Report"],
  ["Client", 11, "Client Balance, Client Contact List, Client Referral, New Clients Report, Terminations Report, Cancellation Count Report"],
  ["Revenue", 10, "Invoice Audit Summary, Payment Audit Summary, Revenue by Postal Code, Revenue by Service Summary, Daily Production, Sales Activity Summary"],
  ["Schedule Lists", 8, "Employee Directory, Vendor Contact List, Inventory Product List, Call Ahead Required, Service Price List"],
  ["Job Costing", 8, "Job Costing Report, Cost of Goods Sold Report, Job Cost Summary, Service Profitability Summary, Production Rate Accuracy, WIP Report"],
  ["Financial", 6, "Invoiced Income by Client, Invoices with Balances, Pre-Payments, Profit / Loss (Accrual), Profit / Loss (Cash), Sales Tax Report"],
  ["Audits", 6, "Client Timeline Report, Lead Timeline Report, Income Not Invoiced, Visits — Client Has Balance Due, Unapplied Payments, Sales Commission Export"],
  ["Lead", 5, "New Leads Report, Lead Aging Summary, Closed Leads Summary, Company Scorecard, Sales Summary by Source"],
  ["Estimates", 4, "Estimates by Stage, Accepted Estimates by Service, Accepted Estimates — Estimated vs Invoiced Value"],
  ["Job Hours", 3, "Job Hours Summary, Crew Hours Summary, Timesheet Detail"],
  ["Receivables", 2, "A/R Aging Report, A/R Aging Snapshot"],
  ["Forms", 1, "Forms Summary"],
];

const DATASETS = [
  "Clients", "Client Contacts", "Client Timeline", "Jobs", "Job Visits",
  "Job Services (Production Rate Accuracy)", "Invoices", "Invoice Line Items",
  "Payments", "Estimates", "Estimate Line Items", "Contracts", "Timesheets",
  "Employees", "Services", "Vendors", "Products", "Chemical Applications",
  "Projects — WIP Schedule", "Sales Rep — Current Month", "Contract Service Usage",
];

const CURATED_DASHBOARDS: [string, string, string][] = [
  ["Equipt Dashboard", "/dashboards/equipt", "Requires the Equipt module"],
  ["Landscapt My Day", "/dashboards/myday", "Requires the Landscapt module"],
  ["Reports Dashboard", "/dashboards/landscapt-reports", "Requires the Landscapt module"],
  ["KPI Scorecard", "/dashboards/kpis", "Requires the Landscapt module, hidden from crew role"],
  ["Financial", "/dashboards/financials", "Internal org only"],
  ["Labor Efficiency", "/dashboards/avb", "Internal org only"],
  ["Driver Safety Scores", "/dashboards/safety", "Internal org only"],
  ["Company Report", "/dashboards/crm", "Requires the Landscapt module, hidden from crew role"],
];

export default function ReportCenterGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Reporting"
        title="Report Center & Dashboards"
        description="Where the ~75 pre-built reports live, how a report actually runs, and how the curated dashboards differ from the ones you build yourself."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where-it-lives">Where it lives</TOCLink>
          <TOCLink href="#report-center">The Report Center tab</TOCLink>
          <TOCLink href="#how-a-report-runs">How a report actually runs</TOCLink>
          <TOCLink href="#worked-example">Worked example: Production Rate Accuracy</TOCLink>
          <TOCLink href="#dates-and-limits">Date ranges, Eastern time, and large results</TOCLink>
          <TOCLink href="#custom-analysis">Custom analyses (&quot;My Reports&quot;)</TOCLink>
          <TOCLink href="#dashboards-vs-reports">Dashboards vs. individual reports</TOCLink>
          <TOCLink href="#curated-dashboards">The curated, top-level dashboards</TOCLink>
          <TOCLink href="#kpi-scorecard">The KPI Scorecard</TOCLink>
          <TOCLink href="#company-report">The Company Report</TOCLink>
          <TOCLink href="#export">Exporting, printing, and scheduled delivery</TOCLink>
          <TOCLink href="#permissions">Permissions and gating</TOCLink>
        </div>
      </div>

      <Callout>
        Looking for what a specific report actually measures, rather than how the Report Center
        works? See the{" "}
        <a href="/settings/support/reports-reference-guide" className="font-semibold underline">
          Reports Reference guide
        </a>{" "}
        for a description, filters, and known gotchas for every report.
      </Callout>

      <Section id="where-it-lives" title="Where it lives">
        <p>
          The CRM admin sidebar has a <strong>Reports</strong> link that points to{" "}
          <code>/crm/admin/reports</code>. That route renders a single client component,{" "}
          <code>ReportsHub</code>, which is a
          five-tab shell driven by a <code>?tab=</code> query param — <strong>Dashboard</strong>,{" "}
          <strong>Custom Dashboards</strong>, <strong>Report Center</strong>,{" "}
          <strong>My Reports</strong>, and <strong>Graphics Library</strong>. This is the &quot;Report
          Center&quot; proper. It&apos;s a separate thing from the top-level{" "}
          <code>/dashboards</code> route group covered below — that one is reached from its own
          sidebar (<code>ReportsSidebar</code>) and holds a set of hand-built, curated
          dashboards, one of which (&quot;Reports Dashboard&quot;) happens to be Landscapt&apos;s
          older built-in reporting page (<code>CRMReports</code> component).
        </p>
      </Section>

      <Section id="report-center" title="The Report Center tab">
        <p>
          The <strong>Report Center</strong> tab renders <code>ReportCatalog</code> — a
          single searchable table, grouped by section header rows, listing every report in{" "}
          <code>ALL_REPORTS</code>. That
          array is the union of twelve definition arrays, one array per{" "}
          <code>ReportSectionKey</code>.
          Counting the actual <code>section:</code> entries across those files gives{" "}
          <strong>75 reports</strong> total, close to the ~70 figure — spread across twelve
          sections:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Section</th>
              <th className="w-16 px-3 py-2">Count</th>
              <th className="px-3 py-2">Examples actually found in the code</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {SECTIONS.map(([label, count, examples]) => (
              <tr key={label} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{label}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{count}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{examples}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Clicking a report name in the catalog links to{" "}
          <code>/crm/admin/reports/r/[reportKey]</code>, rendered by{" "}
          <code>ReportViewer</code>.
        </p>
      </Section>

      <Section id="how-a-report-runs" title="How a report actually runs">
        <p>
          Every catalog entry is a <code>PrebuiltReportDef</code>, and its doc comment
          spells out the three shapes a report can take — exactly one of:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Declarative (<code>analysis</code>)</strong> — the vast majority. The
            definition&apos;s <code>analysis(params)</code> function builds an{" "}
            <code>AnalysisConfig</code> (dataset name, columns, filters, group-by, aggregates,
            sort) from the filter-bar values, and that config is executed through the{" "}
            <code>crm_run_report</code> Postgres RPC via <code>runAnalysis()</code>. The RPC itself
            re-validates every identifier server-side;
            the client-side <code>validateAnalysisConfig</code> only exists to fail fast with a
            friendlier error message.
          </li>
          <li>
            <strong>Bespoke handler (<code>run</code>)</strong> — for shapes the generic
            group-by/aggregate engine can&apos;t produce: aging buckets, month-column matrices,
            multi-table summaries. These get a hand-written async function that queries directly
            and returns a <code>ReportResult</code>.
          </li>
          <li>
            <strong>Link-out (<code>href</code>)</strong> — a handful of reports (e.g. the Job
            Costing Report and COGS Report) are really
            pointers to an existing standalone page under <code>/crm/reports/*</code> — the
            catalog entry exists so they&apos;re searchable and appear in the same list, but{" "}
            <code>ReportViewer</code> just redirects (<code>LinkOutCard</code>). Job Costing and
            COGS share one loader (<code>src/lib/visit-costing.ts</code>) whose unit of analysis
            is a <strong>completed visit</strong> in the date window: revenue is the visit&apos;s
            service rate, labor is the crew&apos;s clock-out labor cost or — when nobody clocked out
            — an estimate of man-hours × the crew&apos;s labor burden rate (marked with a dagger,
            †), materials are the job materials logged against the visit, and a multi-service
            visit is split across its services by man-hour share.
          </li>
        </ul>
        <p>
          The actual HTTP execution path for declarative and bespoke reports is a GET to{" "}
          <code>/api/crm/reports/run/[reportKey]</code>: it authenticates the
          user, looks up the definition by key in <code>REPORT_MAP</code>, flattens the URL query
          string into filter params, and calls either <code>def.run()</code> or{" "}
          <code>runAnalysis(def.analysis(params))</code> — the client hook driving this is{" "}
          <code>useRunReport</code>.
        </p>
        <p>
          Every declarative report reads from one of <strong>21 named datasets</strong> defined
          in <code>REPORT_DATASETS</code>, each a
          flat, pre-joined view over the underlying tables (columns, types, and — for
          enum-like text columns — a fixed option list). The full set:
        </p>
        <p className="text-xs text-[#6a6a66]">{DATASETS.join(" · ")}</p>
      </Section>

      <Section id="worked-example" title="Worked example: Production Rate Accuracy">
        <p>
          <strong>Production Rate Accuracy</strong> lives in the Job Costing section. Its stated
          purpose: &quot;Compares each service&apos;s assumed production rate (sq ft per
          man-hour) against what crews actually achieved, to flag rates that need
          recalibrating.&quot;
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open it from the Report Center catalog or navigate directly to{" "}
            <code>/crm/admin/reports/r/production-rate-accuracy</code>.
          </li>
          <li>
            It has a single filter — <strong>Scheduled Between</strong>, a date-range picker
            defaulting to &quot;This Month&quot; (<code>dateRangeFilterDef(&quot;Scheduled
            Between&quot;, &quot;this_month&quot;)</code>). Changing the preset (This Month, Last
            Month, Last 30/90 Days, This Year, All Time, or Custom) recomputes the{" "}
            <code>from</code>/<code>to</code> window client-side
            (<code>computePresetRange</code>) and re-runs the
            query. <strong>All Time</strong> sends an explicitly unbounded range — it really means
            every row, not a silent fallback to This Month.
          </li>
          <li>
            Under the hood, its <code>analysis()</code> builds a query against the{" "}
            <code>rpt_job_services</code> dataset, filtered to{" "}
            <code>budget_method = &quot;production_rate&quot;</code> and{" "}
            <code>visit_status = &quot;completed&quot;</code> — the <em>visit&apos;s</em> status,
            so a recurring job&apos;s not-yet-done visits stay out even once the job itself is
            marked complete — plus the date-range filter on{" "}
            <code>scheduled_date</code>. It pulls columns like scheduled date, client, service
            name, quantity/unit, assumed vs. actual production rate, rate variance (in basis
            points), budgeted vs. actual hours, and crew size — sorted ascending by{" "}
            <code>rate_variance_bps</code> so the worst-performing rates surface first.
          </li>
          <li>
            The result renders as a plain table (<code>ReportTable</code>) with two footnotes
            defined on the report itself: only production-rate-method services are included
            (manual-rate services have nothing to compare against), and a negative Rate Variance
            means the job took longer than the assumed rate predicted (the rate may be set too
            aggressively) while positive means the rate may be too conservative.
          </li>
        </ol>
        <Callout>
          This is the report referenced in the CRM sprint memory as part of the job-costing
          pipeline work — it&apos;s a real, currently-shipped report, not a planned one.
        </Callout>
      </Section>

      <Section id="dates-and-limits" title="Date ranges, Eastern time, and large results">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Everything is Eastern time.</strong> Every date and time a report evaluates —
            the relative presets (Today, Yesterday, Month to Date, Year to Date), a custom
            From/To pair, a bare date typed into a filter — is interpreted on America/New_York
            calendar days. A filter on a single date matches the whole Eastern day, and a visit
            completed at 11:30 PM Eastern lands on that day, not the next UTC day. Scheduled PDFs
            format their times in Eastern as well.
          </li>
          <li>
            <strong>&quot;All Time&quot; means all time.</strong> Picking All Time in a date-range
            filter (or clearing both From and To) sends an explicitly unbounded window. It used
            to quietly run the report&apos;s default preset instead.
          </li>
          <li>
            <strong>Large results are truncated, and say so.</strong> The engine returns at most
            5,000 rows. When a report or panel matches more than that, a banner reads
            &quot;Showing the first N of M rows&quot; and the totals row covers{" "}
            <em>only the returned rows</em> — narrow the date range or add a filter to get a
            complete total.
          </li>
          <li>
            <strong>Group subtotals cover the whole result</strong>, not just the rows on the
            page you are looking at, so the on-screen subtotal for a crew or client matches the
            PDF.
          </li>
          <li>
            <strong>Exports carry the totals row.</strong> CSV, Excel, and PDF downloads end with
            the same Totals row the on-screen table shows.
          </li>
        </ul>
      </Section>

      <Section id="custom-analysis" title='Custom analyses ("My Reports")'>
        <p>
          The <strong>My Reports</strong> tab (<code>MyReportsList</code>) lists
          org-saved <code>CustomReport</code> records and links to{" "}
          <code>/crm/admin/reports/analysis/new</code> to build one from scratch via{" "}
          <code>CustomAnalysisBuilder</code>. A custom analysis is the same{" "}
          <code>AnalysisConfig</code> shape a pre-built report&apos;s <code>analysis()</code>{" "}
          function produces — pick one of the 19 datasets, pick columns, group-by, aggregates,
          filters, and sort — except a user assembles it visually instead of it being hard-coded
          in a definitions file, and it&apos;s persisted (name + description + config) rather
          than shipped in the registry. It executes through the identical{" "}
          <code>crm_run_report</code> RPC path.
        </p>
        <p>
          A few dataset columns exist specifically so a custom analysis can apply the same rules
          the pre-built reports do (see the{" "}
          <a href="/settings/support/reports-reference-guide" className="font-semibold underline">
            Reports Reference guide
          </a>{" "}
          for the rules themselves):
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Invoices</strong> and <strong>Invoice Line Items</strong> — an{" "}
            <strong>Issued (not draft/void)</strong> boolean (&quot;Is Issued&quot;). Filter on it
            for any revenue or receivables figure; the pre-built reports do.
          </li>
          <li>
            <strong>Payments</strong> — <strong>Cash Received (not credit/write-off)</strong>{" "}
            (&quot;Is Cash&quot;), <strong>Account Credit</strong> (&quot;Is Credit&quot;),{" "}
            <strong>Net Amount (after refunds)</strong>, and <strong>Processing Fee</strong>. A
            &quot;Collected&quot; number should filter Is Cash = true and sum Net Amount.
          </li>
        </ul>
        <p>
          Saving or running a custom analysis requires the <strong>View Report Center</strong>{" "}
          permission, and some datasets additionally require a report permission — see{" "}
          <a href="#permissions" className="font-semibold underline">Permissions and gating</a>.
        </p>
      </Section>

      <Section id="dashboards-vs-reports" title="Dashboards vs. individual reports">
        <p>
          Inside the Report Center, <strong>Custom Dashboards</strong>{" "}
          (<code>DashboardsList</code>) are described
          in the UI itself as &quot;Multi-tab dashboards built from your saved analyses&quot;.
          A <code>Dashboard</code> record bundles one or more{" "}
          <code>CustomReport</code> analyses into tabs, built either from a blank starting point
          or from one of the entries in <code>DASHBOARD_TEMPLATES</code> — e.g. &quot;Sales
          Overview&quot; (estimate pipeline, win rate, recent activity) or &quot;A/R
          Overview&quot; (outstanding balances, collections, payment activity). A saved dashboard
          opens at <code>/crm/admin/reports/dashboards/[id]</code>, rendered by{" "}
          <code>DashboardViewer</code>.
        </p>
        <p>
          Notably, that <em>same</em> <code>DashboardViewer</code> component is also mounted at{" "}
          <code>/dashboards/custom/[id]</code> — a user-built
          dashboard is reachable through either the Report Center&apos;s own tab or the top-level
          Dashboards sidebar, both pointing at the same underlying record and{" "}
          <code>useDashboards()</code> query.
        </p>
        <p>
          <strong>Panel dates.</strong> A tab can carry a shared date picker, and each panel
          chooses whether to follow it. A panel can instead pin its own relative window —{" "}
          <strong>Filter to today</strong>, <strong>Filter to yesterday</strong>,{" "}
          <strong>Month to date</strong>, or <strong>Year to date</strong> — computed in Eastern
          time every time the dashboard loads. The seeded templates use this for their annual
          gauges: &quot;Invoiced Revenue (YTD)&quot;, &quot;New Leads YTD&quot;, and &quot;New
          Clients / Converted Leads YTD&quot; are true January-1-to-today figures and{" "}
          <em>do not</em> move when you change the tab&apos;s date picker, so the gauge maximum
          keeps meaning an annual target.
        </p>
        <p>
          A panel whose dataset the signed-in user isn&apos;t allowed to query renders &quot;You
          don&apos;t have permission to view this panel&quot; in place of the chart — see{" "}
          <a href="#permissions" className="font-semibold underline">Permissions and gating</a>.
        </p>
      </Section>

      <Section id="curated-dashboards" title="The curated, top-level dashboards">
        <p>
          Separate from anything a user builds, the app also ships a fixed set of hand-built
          dashboard pages under <code>/dashboards/*</code>, listed on{" "}
          <code>/dashboards</code> itself (<code>DashboardsHomePage</code>) and in{" "}
          <code>ReportsSidebar</code>&apos;s <code>DASHBOARDS_NAV</code>:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Dashboard</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Gate</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {CURATED_DASHBOARDS.map(([name, href, gate]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#4a4a46]"><code>{href}</code></td>
                <td className="px-3 py-2 text-[#4a4a46]">{gate}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          These plus any user-built Custom Dashboards are what the Dashboards home page and
          sidebar are enumerating. &quot;Reports
          Dashboard&quot; is worth calling out: it&apos;s not part of the Report Center at all —
          it renders <code>CRMReports</code>, Landscapt&apos;s older,
          pre-Report-Center built-in reporting page, which the Report Center hub also embeds as
          its own &quot;Dashboard&quot; tab.
        </p>
      </Section>

      <Section id="kpi-scorecard" title="The KPI Scorecard">
        <p>
          <code>/dashboards/kpis</code> is an annual goals card: metrics grouped into categories
          (Financial, Operations, Sales, People by default), each with a <strong>Target</strong>,
          an <strong>Actual</strong>, a progress bar, and a percent weight. Every org gets one
          scorecard, created from the default layout the first time someone opens the page, and
          the year selector in the header switches which calendar year you are scoring.
        </p>
        <p>
          Metrics come in two kinds, and the badge on the Actual cell tells you which:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Auto</strong> — computed live from Landscapt data every time the page loads
            (invoices, payments, jobs, visits, timesheets, estimates, clients, employees, tickets).
            Nothing is cached, so the number is never stale. Hover the <em>auto</em> badge for the
            exact definition. Revenue metrics count issued invoices only (no drafts or voids), and
            Cash Collected counts cash payments only — no account credits or AR write-offs, net of
            refunds. A dash means there was nothing to compute from for that year — for
            example Revenue (Sold) needs jobs with a Date Sold, and Maintenance Retention needs
            recurring or package jobs that existed before January&nbsp;1.
          </li>
          <li>
            <strong>Manual</strong> — click the Actual cell and type the value. These are things
            Landscapt has no source for: NOI and net margin, overhead ratio, AP days, labor
            efficiency against payroll hours, fleet safety score, eNPS, training hours, training
            completion, accident-free workdays, absenteeism, plus any custom metric you add.
          </li>
        </ul>
        <p>
          Targets are always editable (click the cell). Some auto metrics are point-in-time
          snapshots rather than year totals — AR Outstanding, Open Pipeline, Active Clients,
          Contract MRR, Open Tickets — and say so in their badge tooltip.
        </p>
        <p>
          <strong>Scoring.</strong> Progress is actual ÷ target, capped at 100%. Metrics flagged
          &quot;lower is better&quot; (AR Days, OT %, Skipped Visit %, …) invert that: meeting or
          beating the target is 100%, and progress degrades the further you are above it. A
          category&apos;s score is the weight-averaged progress of its metrics that have both a
          target and an actual; the Overall pill is the plain average of the category scores.
        </p>
        <p>
          <strong>Customize.</strong> The Customize button switches the card into an editor where
          you can:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Add a metric from the catalog dropdown (grouped by suggested category, each tagged auto or manual) — about sixty are available, including Cash Collected, Gross Profit, Labor % of Revenue, Revenue per Man-Hour, AR Over 60 Days, Visit Completion Rate, Budget vs Actual Hours, Maintenance Retention (overall, residential, commercial), Client Retention, New Hires, Average Tenure, Days Since Last Damage Case.</li>
          <li>Add your own manual metric (name + unit) for anything you track outside the app.</li>
          <li>Remove any metric, including the defaults — it goes back into the dropdown so it can be re-added later.</li>
          <li>Change weights, toggle lower-is-better, reorder rows, rename or add categories, or Reset to default.</li>
        </ul>
        <p>
          <strong>Who can do what.</strong> Anyone whose role has <strong>View Report Center</strong>
          can open the scorecard and see every number. Changing it — editing a target, typing a
          manual actual, or anything in Customize — requires <strong>Manage Report Center</strong>,
          the same permission that gates building Custom Dashboards and custom analyses. Org admins
          always have it; of the default roles, Owner and Operations Manager have it and the rest
          (Accounting, Office Admin, Sales / Account Mgr, Scheduler, Customer Support Rep) are
          view-only. Without it the Customize button is hidden and the cells are read-only, and the
          database policies reject the write regardless of the UI. Crew logins have neither
          permission, so they cannot reach the page at all. Roles are managed under Settings &gt;
          CRM Settings &gt; Roles.
        </p>
        <p>
          The layout is saved per org in <code>crm_kpi_scorecards</code>; targets and manual
          actuals are saved per year in <code>crm_kpi_scorecard_entries</code>. Both are RLS-scoped
          to the org.
        </p>
      </Section>

      <Section id="company-report" title="The Company Report">
        <p>
          <code>/dashboards/crm</code> is a live, always-current sales and operations snapshot,
          computed entirely from Landscapt data. It has no filters or date picker — it&apos;s
          always &quot;as of now&quot;: year-to-date figures run from January 1 of the current
          year, and the monthly tables cover the trailing three calendar months, the current one
          as month-to-date.
        </p>
        <p>
          Every number comes from the same <code>crm_run_report</code> RPC and{" "}
          <code>rpt_*</code> views the rest of the Report Center uses (<code>rpt_clients</code>,{" "}
          <code>rpt_estimates</code>, <code>rpt_invoices</code>), plus direct queries against
          payments, invoices, and tickets for the handful of figures — per-client aging buckets,
          cash-only payment totals, ticket assignee counts — that a simple group-by can&apos;t
          express.
        </p>
        <p>The page has four sections:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>KPI row</strong> — Invoiced Revenue, Outstanding A/R, New Clients, and New
            Leads, year-to-date. The progress bars under Invoiced Revenue, New Clients, and New
            Leads read the matching Target from that org&apos;s KPI Scorecard (same metric keys)
            — set a target there and it shows up here automatically.
          </li>
          <li>
            <strong>Sales Dashboard</strong> — monthly new-client/lead trend, close ratios and
            open pipeline by sales rep, a won-estimates leaderboard, and this month&apos;s new
            clients by rep and source.
          </li>
          <li>
            <strong>Operations</strong> — invoices, sales tax, and payments over the trailing
            three months, open tickets by category and assignee, and unapplied/pre-payment
            totals.
          </li>
          <li>
            <strong>Collections / A/R</strong> — the standard five-bucket aging breakdown and
            the ten largest outstanding balances, each tagged OK / Monitor / Action / Escalate by
            a fixed dollar-threshold rule (see below).
          </li>
        </ul>
        <Callout>
          <strong>Flags &amp; Priority Actions</strong> are rule-based, not AI-generated. The old
          screenshot workflow included hand-written commentary on specific accounts; this version
          instead evaluates a fixed set of thresholds against the same numbers on the page —
          e.g. any client with a large balance over 90 days past due, more than 30% of A/R in the
          two oldest buckets, a meaningful pile of unused pre-payments, several unassigned
          tickets, revenue running behind a pace-adjusted annual target. No account gets
          free-form judgment or a narrative explanation; a flag either fires past its threshold
          or it doesn&apos;t. The thresholds live in{" "}
          <code>src/lib/company-report/flags.ts</code> and are easy to retune.
        </Callout>
        <p>
          Gated the same as the rest of the Report Center: <code>view_report_center</code> to
          open it, Landscapt module required, hidden from crew. There&apos;s nothing to edit on
          this page — no Manage Report Center split, unlike the KPI Scorecard.
        </p>
      </Section>

      <Section id="export" title="Exporting, printing, and scheduled delivery">
        <p>
          Every pre-built report and custom analysis runs through the same viewer chrome
          (<code>PrebuiltReportRunner</code>), which offers four
          output actions once a result has rows:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>CSV</strong> — <code>downloadCSV</code>.</li>
          <li><strong>Excel</strong> — <code>downloadXLSX</code>.</li>
          <li><strong>PDF</strong> — <code>exportReportPDF</code>, backed by <code>/api/crm/reports/export/pdf</code>.</li>
          <li><strong>Print</strong> — a plain <code>window.print()</code> call; the filter bar and page header carry a <code>print:hidden</code> class so only the table prints.</li>
        </ul>
        <p>
          All three downloads end with a <strong>Totals</strong> row matching the one on screen
          (per-group subtotals for grouped reports). If the on-screen result was truncated at
          5,000 rows, the export is too — and its totals cover only those rows.
        </p>
        <p>
          <strong>Scheduled delivery.</strong> Reports flagged as schedulable — currently the five
          fixed-window <em>Actual v. Budgeted Hours</em> reports (Today, Yesterday, Week to Date,
          Last Week, Month to Date) — show a <strong>Schedule</strong> button in the viewer. It
          sets up daily email delivery of that report as a PDF: enter one or more recipient
          addresses and pick a <strong>Send time</strong> (an hour of the day, Eastern). An hourly
          job delivers each schedule on the <strong>first run at or after its scheduled hour</strong>{" "}
          — so a 7 AM schedule goes out on the 7 AM run, or the 8 AM run if the 7 AM one fired late
          — and never twice in the same day. Times inside the PDF are formatted in Eastern.
        </p>
      </Section>

      <Section id="permissions" title="Permissions and gating">
        <p>
          Gating on the reporting surfaces is by <strong>subscription plan and org
          flag</strong>, not by a distinct report-level role:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Module gating</strong> — <code>useModuleAccess(&quot;equipt&quot; |
            &quot;landscapt&quot;)</code> checks the org&apos;s
            Stripe plan against <code>planIncludesModule</code>; it hides the Equipt Dashboard,
            Landscapt My Day, and Reports Dashboard cards/links when the org&apos;s plan doesn&apos;t
            include that module. The KPI Scorecard and Company Report cards/links require the Landscapt
            module too.
          </li>
          <li>
            <strong>Internal-only dashboards</strong> — Financial, Labor Efficiency, and Driver
            Safety Scores are gated by <code>useIsInternalOrg()</code> both in the
            nav (hidden entirely) and by an <code>InternalOnlyGuard</code> wrapping{" "}
            <code>{"{children}"}</code> in the reports layout itself for the paths listed in{" "}
            <code>INTERNAL_ONLY_PATHS</code> —
            so even a direct URL hit is blocked, not just hidden from the nav.
          </li>
          <li>
            <strong>Crew role</strong> — the KPI Scorecard, Company Report, and Financial nav
            entries set <code>hideFromCrew</code>, <code>DashboardsHomePage</code>
            independently checks <code>currentUser.role === &quot;crew&quot;</code> to hide the
            same cards, and <code>CrewBlockedGuard</code> in the reports layout blocks the office
            dashboards by URL as well.
          </li>
          <li>
            <strong>Custom Dashboards module gate</strong> — both{" "}
            <code>/dashboards/custom/[id]</code> and the list of custom dashboards shown on the
            Dashboards home page are wrapped in{" "}
            <code>ModuleAccessGuard module=&quot;landscapt&quot;</code> /{" "}
            <code>hasLandscapt</code> checks — Custom Dashboards are a Landscapt-only feature.
          </li>
        </ul>
        <p>
          The KPI Scorecard is the one reporting surface with a view/edit split: View Report
          Center to open it, Manage Report Center to change targets, manual actuals, or the
          layout (see the KPI Scorecard section above).
        </p>
        <p>
          On top of that, CRM role permissions (CRM Settings &gt; Roles, Reports tab) gate the
          Report Center itself, and they are enforced server-side, not just hidden in the UI:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>View Report Center</strong> is required for custom analyses, saved reports
            (&quot;My Reports&quot;), Custom Dashboards, and the Graphics Library. Without it the
            API returns 403 regardless of what the sidebar shows.
          </li>
          <li>
            <strong>Per-report keys.</strong> Most pre-built reports map to a permission of the
            same name in the role editor&apos;s CRM Reports, Scheduling Reports, and Accounting
            Reports sections (<code>REPORT_PERMISSION_KEYS</code> in{" "}
            <code>src/lib/reports/report-permissions.ts</code>). A report with no entry there is
            visible to anyone who can reach the Report Center.
          </li>
          <li>
            <strong>Per-dataset keys for ad-hoc queries.</strong> Because base-table RLS is
            org-wide rather than role-aware, a custom analysis or dashboard panel over a sensitive
            dataset also requires the matching report permission — otherwise anyone with View
            Report Center could pull pay rates or invoice history a role was meant to hide
            (<code>DATASET_PERMISSION_KEYS</code>). Any one of the listed permissions is enough:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Employees</strong> — Employee Directory.</li>
              <li><strong>Timesheets</strong> — Job Hours Summary or Employee Directory.</li>
              <li><strong>Invoices</strong> and <strong>Invoice Line Items</strong> — Invoiced Income by Client, Invoices with Balances, or A/R Aging Report.</li>
              <li><strong>Payments</strong> — Payment Audit Summary, or any of the three invoice permissions above.</li>
              <li><strong>Estimates</strong> and <strong>Estimate Line Items</strong> — View Estimates, Estimates by Stage, or Won Estimates by Service.</li>
            </ul>
            Every other dataset (clients, jobs, visits, services, products, vendors, contracts,
            chemicals, WIP, sales-rep month, contract usage) is gated only by View Report Center.
          </li>
          <li>
            A dashboard panel the signed-in user can&apos;t query is not an error state — it
            renders &quot;You don&apos;t have permission to view this panel&quot; and the rest of
            the dashboard loads normally. Org Admins bypass CRM role checks entirely.
          </li>
        </ul>
        <p>
          Row-level data scoping still applies through Supabase RLS on whatever tables{" "}
          <code>crm_run_report</code> reads — permissions decide which reports and datasets a role
          may run; RLS decides which org&apos;s rows come back.
        </p>
      </Section>
    </DocsFontScope>
  );
}
