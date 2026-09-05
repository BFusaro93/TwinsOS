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
  "Projects — WIP Schedule",
];

const CURATED_DASHBOARDS: [string, string, string][] = [
  ["Equipt Dashboard", "/dashboards/equipt", "Requires the Equipt module"],
  ["Landscapt My Day", "/dashboards/myday", "Requires the Landscapt module"],
  ["Reports Dashboard", "/dashboards/landscapt-reports", "Requires the Landscapt module"],
  ["KPI Scorecard", "/dashboards/kpis", "Requires the Landscapt module, hidden from crew role"],
  ["Financial", "/dashboards/financials", "Internal org only"],
  ["Labor Efficiency", "/dashboards/avb", "Internal org only"],
  ["Driver Safety Scores", "/dashboards/safety", "Internal org only"],
  ["CRM Report", "/dashboards/crm", "Internal org only, hidden from crew"],
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
          <TOCLink href="#custom-analysis">Custom analyses (&quot;My Reports&quot;)</TOCLink>
          <TOCLink href="#dashboards-vs-reports">Dashboards vs. individual reports</TOCLink>
          <TOCLink href="#curated-dashboards">The curated, top-level dashboards</TOCLink>
          <TOCLink href="#kpi-scorecard">The KPI Scorecard</TOCLink>
          <TOCLink href="#export">Exporting and printing</TOCLink>
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
          four-tab shell driven by a <code>?tab=</code> query param — <strong>Dashboard</strong>,{" "}
          <strong>Custom Dashboards</strong>, <strong>Report Center</strong>, and{" "}
          <strong>My Reports</strong>. This is the &quot;Report
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
            <code>ReportViewer</code> just redirects (<code>LinkOutCard</code>).
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
          Every declarative report reads from one of <strong>19 named datasets</strong> defined
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
            query.
          </li>
          <li>
            Under the hood, its <code>analysis()</code> builds a query against the{" "}
            <code>rpt_job_services</code> dataset, filtered to{" "}
            <code>budget_method = &quot;production_rate&quot;</code> and{" "}
            <code>job_status = &quot;completed&quot;</code>, plus the date-range filter on{" "}
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
            exact definition. A dash means there was nothing to compute from for that year — for
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

      <Section id="export" title="Exporting and printing">
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
        <Callout>
          No scheduled or emailed reports were found anywhere in the codebase — every export
          action found is a manual, on-demand download or browser print triggered from the
          viewer. If recurring/emailed report delivery exists, it isn&apos;t wired up here.
        </Callout>
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
            include that module. The KPI Scorecard card/link requires the Landscapt module too.
          </li>
          <li>
            <strong>Internal-only dashboards</strong> — Financial, Labor Efficiency, Driver
            Safety Scores, and CRM Report are gated by <code>useIsInternalOrg()</code> both in the
            nav (hidden entirely) and by an <code>InternalOnlyGuard</code> wrapping{" "}
            <code>{"{children}"}</code> in the reports layout itself for the paths listed in{" "}
            <code>INTERNAL_ONLY_PATHS</code> —
            so even a direct URL hit is blocked, not just hidden from the nav.
          </li>
          <li>
            <strong>Crew role</strong> — the KPI Scorecard, Financial, and CRM Report nav
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
          No per-report role or per-report visibility list was found — every report in{" "}
          <code>ALL_REPORTS</code> is visible to any authenticated user who can reach{" "}
          <code>/crm/admin/reports</code> (the CRM sidebar &quot;Reports&quot; link itself has no
          role check beyond ordinary CRM access). Row-level data scoping still applies through
          Supabase RLS on whatever tables <code>crm_run_report</code> reads.
        </p>
      </Section>
    </DocsFontScope>
  );
}
