import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";
import { GuideLink } from "@/components/docs/GuideLink";

const SECTIONS: [string, number, string][] = [
  ["Service Reports", 17, "Visits Report, Backlog Services, Client Count by Service, Client Services Report, Package Summary Report, Skipped Visits Report, Daily Load List, Chemical Tracking Report, Materials Needed for Upcoming Jobs, Over / Under Report"],
  ["Revenue", 16, "Invoice Audit Summary, Payment Audit Summary, Invoiced Products Report, Revenue by Postal Code, Revenue by Service Summary, Daily Production, Sales Activity Summary, Sales Comparison Chart"],
  ["Client", 14, "Client Balance, Client Contact List, Client Referral, New Clients Report, Terminations Report, Cancellation Count Report, Address Verification"],
  ["Job Hours", 12, "Actual v. Budgeted Hours (Today, Yesterday, Week to Date, Last Week, Month to Date, Custom Range), Job Hours Summary, Crew Hours Summary, Drive Time Summary, Timesheet Detail, Resource Time Utilization"],
  ["Schedule Lists", 9, "Employee Directory, Vendor Contact List, Inventory Product List, Call Ahead Required, Service Price List, Upcoming Jobs - No Contract"],
  ["Audits", 9, "Client Timeline Report, Lead Timeline Report, Income Not Invoiced, Visits — Client Has Balance Due, Unapplied Payments, Sales Commission Export, Audit Log, Security & Access Audit, Change Activity by User"],
  ["Financial", 8, "Credit Report, Invoiced Income by Client, Invoices with Balances, Pre-Payments, Profit / Loss — Accrual Basis, Profit / Loss — Cash Basis, Sales Tax Report, Financials"],
  ["Estimates", 7, "Estimates by Stage, Accepted Estimates by Service, Won Estimates Service Products Report, Accepted Estimates — Estimated vs Invoiced Value, Close Ratios by Sales Rep"],
  ["Job Costing", 6, "Job Costing Report, Cost of Goods Sold Report, Job Cost Summary, Service Profitability Summary, Production Rate Accuracy, WIP Report"],
  ["Lead", 6, "New Leads Report, Lead Aging Summary, Closed Leads Summary, Company Scorecard, Sales Summary by Source"],
  ["Receivables", 3, "Statements, A/R Aging Report, A/R Aging Snapshot"],
  ["Tickets", 1, "My Past Due Tickets"],
  ["Forms", 1, "Forms Summary"],
];

const DATASETS = [
  "Clients", "Client Contacts", "Client Timeline", "Address Verification", "Jobs", "Job Visits",
  "Job Services (Production Rate Accuracy)", "Invoices", "Invoice Line Items",
  "Payments", "Estimates", "Estimate Line Items", "Contracts", "Contract Service Usage",
  "Timesheets", "Crew Drive Time", "Employees", "Services", "Vendors", "Products",
  "Chemical Applications", "Projects — WIP Schedule", "Sales Rep — Current Month",
  "Field Upsells", "Tickets", "Audit Log",
];

const CURATED_DASHBOARDS: [string, string, string][] = [
  ["Equipt Dashboard", "Work orders, purchasing and asset management", "Plans that include Equipt"],
  ["Landscapt My Day", "Your daily schedule and tasks", "Plans that include Landscapt"],
  ["Reports Dashboard", "Landscapt's built-in reporting dashboard", "Plans that include Landscapt"],
  ["KPI Scorecard", "Customizable KPIs computed live from Landscapt data", "Plans that include Landscapt; not crew logins"],
  ["Financial", "Revenue, expenses and margin", "One company's own data only"],
  ["Labor Efficiency", "Budget vs. actual labor hours", "One company's own data only"],
  ["Driver Safety Scores", "Driver safety scoring from the vehicle tracking integration", "One company's own data only"],
  ["Company Report", "Sales, operations and A/R computed live from Landscapt data", "Plans that include Landscapt; not crew logins"],
  ["Social Media", "Weekly reach, engagement, followers and leads by platform", "Not crew logins; needs the View Social Media permission"],
];

export function ReportCenterGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Reporting"
        title="Report Center & Dashboards"
        description="Where the 100+ pre-built reports live, how a report gets its numbers, and how the ready-made dashboards differ from the ones you build yourself."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where-it-lives">Where it lives</TOCLink>
          <TOCLink href="#report-center">The Report Center tab</TOCLink>
          <TOCLink href="#how-a-report-runs">How a report gets its numbers</TOCLink>
          <TOCLink href="#worked-example">Worked example: Production Rate Accuracy</TOCLink>
          <TOCLink href="#dates-and-limits">Date ranges, time zones, money rules, and large results</TOCLink>
          <TOCLink href="#custom-analysis">Custom analyses (&quot;My Reports&quot;)</TOCLink>
          <TOCLink href="#dashboards-vs-reports">Dashboards vs. individual reports</TOCLink>
          <TOCLink href="#payroll">The Payroll tab</TOCLink>
          <TOCLink href="#graphics-library">The Graphics Library</TOCLink>
          <TOCLink href="#curated-dashboards">The ready-made dashboards</TOCLink>
          <TOCLink href="#kpi-scorecard">The KPI Scorecard</TOCLink>
          <TOCLink href="#company-report">The Company Report</TOCLink>
          <TOCLink href="#social-media">The Social Media dashboard</TOCLink>
          <TOCLink href="#audit-trail">Audit trail: per-record tabs and the company-wide log</TOCLink>
          <TOCLink href="#export">Exporting, printing, and scheduled delivery</TOCLink>
          <TOCLink href="#permissions">Permissions and gating</TOCLink>
        </div>
      </div>

      <Callout>
        Looking for what a specific report actually measures, rather than how the Report Center
        works? See the{" "}
        <GuideLink href="/settings/support/reports-reference-guide" className="font-semibold underline">
          Reports Reference guide
        </GuideLink>{" "}
        for a description, filters, and known gotchas for every report.
      </Callout>

      <Section id="where-it-lives" title="Where it lives">
        <p>
          In the Landscapt sidebar, open <strong>Administration &gt; Reports</strong>. The Reports
          page has seven tabs across the top: <strong>Dashboard</strong>,{" "}
          <strong>Custom Dashboards</strong>, <strong>Report Center</strong>,{" "}
          <strong>My Reports</strong>, <strong>Scheduled</strong>, <strong>Payroll</strong> (only
          for people allowed to see it), and <strong>Graphics Library</strong>. This page is the
          Report Center proper, and the tab you pick is kept in the page&apos;s web address, so a
          bookmark or shared link opens on the same tab.
        </p>
        <p>
          Separate from it is the <strong>Dashboards</strong> area &mdash; the{" "}
          <strong>Dashboards</strong> tile on the Home screen &mdash; which has its own sidebar
          and holds a set of ready-made dashboards (covered below). One of those,{" "}
          <strong>Reports Dashboard</strong>, is Landscapt&apos;s original built-in reporting page;
          it&apos;s the same page you see on the Reports page&apos;s <strong>Dashboard</strong> tab.
        </p>
        <Callout>
          <strong>Advanced Reporting add-on.</strong> Four tabs &mdash; <strong>Custom
          Dashboards</strong>, <strong>My Reports</strong>, <strong>Scheduled</strong> and the{" "}
          <strong>Graphics Library</strong> &mdash; are part of the Advanced Reporting add-on, along
          with the New Analysis and dashboard builders. It&apos;s included on Enterprise and during
          your free trial, and an admin can add it to Starter or Growth in{" "}
          <strong>Settings &gt; Subscription</strong>. Without it those tabs show what the add-on
          includes, custom dashboards don&apos;t appear under the Dashboards tile, and scheduled
          emails aren&apos;t sent. The three <strong>built-in</strong> dashboards (Sales Overview,
          A/R Overview and Operations Dashboard) stay on the Custom Dashboards tab on every plan,
          but changing or copying one needs the add-on, and a built-in you changed while you had
          it locks like a custom dashboard. Everything else on this page &mdash; every pre-built
          report, the Dashboard tab, Payroll, the KPI Scorecard, the Company Report and the job
          costing reports &mdash; is on every plan. Nothing you built is deleted: it all comes back, and
          schedules start sending again, once the add-on is added.
        </Callout>
      </Section>

      <Section id="report-center" title="The Report Center tab">
        <p>
          The <strong>Report Center</strong> tab is one searchable list (type in{" "}
          <em>Search reports…</em>) of every pre-built report, grouped under section headings.
          There are <strong>109 reports</strong> across thirteen sections:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Section</th>
              <th className="w-16 px-3 py-2">Count</th>
              <th className="px-3 py-2">Examples</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {SECTIONS.map(([label, count, examples]) => (
              <tr key={label} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{label}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{count}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{examples}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Click a report&apos;s name to open it. Each report has its own page, so you can bookmark
          the ones you use often.
        </p>
      </Section>

      <Section id="how-a-report-runs" title="How a report gets its numbers">
        <p>Every report in the catalog works in one of three ways:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Built on a dataset</strong> &mdash; the vast majority. The report picks a
            dataset (see the list below), the columns to show, filters, grouping, totals and sort
            order, and fills in the values you choose in its filter bar. Every time it runs, the
            server checks the request again before returning any rows; if a filter value doesn&apos;t
            make sense, you get a plain error message instead of results.
          </li>
          <li>
            <strong>Special-format reports</strong> &mdash; for layouts a simple grouped table
            can&apos;t produce: aging buckets, one-column-per-month grids, and summaries that pull
            from several kinds of records at once. These are built individually but open and
            export the same way.
          </li>
          <li>
            <strong>Links to a standalone page</strong> &mdash; a handful of reports (for example
            the Job Costing Report and the Cost of Goods Sold Report) have their own dedicated
            page. They&apos;re listed in the catalog so you can search for them alongside
            everything else; opening one takes you to that page. Job Costing and Cost of Goods Sold
            work the same way: each line is a <strong>completed visit</strong> in the date range.
            Revenue is the visit&apos;s service rate; labor is the crew&apos;s labor cost from
            clock-out or &mdash; when nobody clocked out &mdash; an estimate of man-hours × the
            crew&apos;s labor burden rate (marked with a dagger, †); materials are the job
            materials logged against the visit; and a visit with several services is split across
            them by each service&apos;s share of the man-hours.
          </li>
        </ul>
        <p>
          Changing a filter re-runs the report straight away, and your permissions are checked on
          every run (see{" "}
          <a href="#permissions" className="font-semibold underline">Permissions and gating</a>).
        </p>
        <p>
          The dataset-based reports read from <strong>26 datasets</strong>. Each one is a
          ready-joined table for one kind of record &mdash; its columns, their types, and, for
          status-type columns, a fixed list of choices. These are the same datasets you pick from
          when you build your own analysis:
        </p>
        <p className="text-xs text-[#6a6a66] dark:text-neutral-400">{DATASETS.join(" · ")}</p>
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
            Open it from the Report Center tab (search for &quot;Production Rate&quot;) or from a
            bookmark of its page.
          </li>
          <li>
            It has a single filter &mdash; <strong>Scheduled Between</strong>, a date-range picker
            that starts on <strong>This Month</strong>. Changing the preset (This Month, Last
            Month, Last 30/90 Days, This Year, All Time, or Custom) works out the new date range
            on your company&apos;s calendar (its time zone, not your computer&apos;s) and re-runs
            the report. <strong>All Time</strong> really means every row &mdash; it isn&apos;t
            quietly limited to This Month.
          </li>
          <li>
            Behind the scenes it reads the <strong>Job Services</strong> dataset and keeps only
            services whose budget method is <strong>Production Rate</strong> on visits marked{" "}
            <strong>completed</strong>, scheduled within the date range. It&apos;s the{" "}
            <em>visit&apos;s</em> status that counts, so a recurring job&apos;s not-yet-done visits
            stay out even once the job itself is marked complete. It shows the scheduled date,
            client, service name, quantity and unit, the assumed vs. actual production rate, the
            rate variance (in basis points), budgeted vs. actual hours, and crew size &mdash;
            sorted by rate variance, lowest first, so the worst-performing rates are at the top.
          </li>
          <li>
            The result is a plain table with two footnotes: only Production Rate method services
            are included (manual-rate services have nothing to compare against), and a negative
            Rate Variance means the job took longer than the assumed rate predicted (the rate may
            be set too aggressively) while positive means the rate may be too conservative.
          </li>
        </ol>
        <Callout>
          To recalibrate a rate this report flags, open the service under{" "}
          <strong>Administration &gt; Services</strong> and change its{" "}
          <strong>Production Rate (sqft/hr)</strong>.
        </Callout>
      </Section>

      <Section id="dates-and-limits" title="Date ranges, time zones, money rules, and large results">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Everything runs on your company&apos;s clock, not the viewer&apos;s.</strong>{" "}
            Every date and time a report evaluates &mdash; the relative presets (Today, Yesterday,
            Month to Date, Year to Date), a custom From/To pair, a single date typed into a filter
            &mdash; uses the time zone set in <strong>Settings &gt; Organization</strong> (Eastern
            Time unless you change it). A filter on a single date matches that whole day in your
            company&apos;s time zone, and a visit completed at 11:30 PM lands on that day, not the
            next. Scheduled PDFs show times in your company&apos;s time zone as well. Two managers
            in different time zones looking at the same reports see identical day boundaries.
          </li>
          <li>
            <strong>&quot;All Time&quot; means all time.</strong> Picking All Time in a date-range
            filter (or clearing both From and To) runs the report with no date limit at all.
          </li>
          <li>
            <strong>Revenue never includes sales tax.</strong> Every revenue figure — Profit /
            Loss, Revenue by Service and by Postal Code, the Sales Comparison Chart, Avg. Gross
            Revenue per Client, the KPI Scorecard, the home Revenue YTD card, the sales-rep quota
            gauge, and the dashboard revenue panels — is the invoice total minus sales tax, i.e.
            after discounts and before tax. Line-based reports (Profit / Loss, Revenue by Service)
            also take the invoice-level discount off, spread across that invoice&apos;s lines in
            proportion to their amounts. Columns labeled &quot;Total&quot; or &quot;incl. tax&quot;
            on invoice listings (Invoiced Income by Client, Invoices with Balances, Invoices and
            Payments) still show the full invoice amount the client owes.
          </li>
          <li>
            <strong>One aging rule.</strong> An open invoice is past due from its due date, or —
            if it has no due date — from its invoice date. A/R Aging, Invoices with Balances
            (Days Overdue), Financials, the Company Report, the KPI Scorecard&apos;s AR Over 60
            Days, the home Overdue AR card, and the Invoices list&apos;s Past Due tab all use it.
          </li>
          <li>
            <strong>Consolidated and merged invoices keep their link.</strong> When invoices are
            consolidated or merged into another invoice, the originals still count toward the
            contract, project, or estimate they were billed for (Over / Under, the WIP Report,
            Accepted Estimates — Estimated vs Invoiced) once the combined invoice is issued; the
            combined invoice itself is not counted again.
          </li>
          <li>
            <strong>Large results are truncated, and say so.</strong> A report returns at most
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
          <li>
            <strong>Exports keep the cell colors.</strong> Conditional-format rules and the color
            spectrum a report or saved analysis is set up with are filled into the Excel and PDF
            downloads and the scheduled sends, the same colors the screen shows. CSV has no
            colors.
          </li>
        </ul>
      </Section>

      <Section id="custom-analysis" title='Custom analyses ("My Reports")'>
        <p>
          The <strong>My Reports</strong> tab lists the analyses your company has saved; click{" "}
          <strong>New Analysis</strong> to build one from scratch. A custom analysis is built from
          the same pieces as a pre-built report &mdash; pick one of the datasets, then columns,
          grouping, totals, filters, and sort &mdash; except you put it together on screen. It&apos;s
          saved with a name and description for everyone in your company, and it runs through the
          same report engine, with the same checks, as the pre-built reports.
        </p>
        <p>
          A few dataset columns exist specifically so a custom analysis can apply the same rules
          the pre-built reports do (see the{" "}
          <GuideLink href="/settings/support/reports-reference-guide" className="font-semibold underline">
            Reports Reference guide
          </GuideLink>{" "}
          for the rules themselves):
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Invoices</strong> and <strong>Invoice Line Items</strong> — an{" "}
            <strong>Issued (not draft/void)</strong> yes/no column (&quot;Is Issued&quot;). Filter
            on it for any revenue or receivables figure; the pre-built reports do.
          </li>
          <li>
            <strong>Payments</strong> — <strong>Cash Received (not credit/write-off)</strong>{" "}
            (&quot;Is Cash&quot;), <strong>Account Credit</strong> (&quot;Is Credit&quot;),{" "}
            <strong>Net Amount (after refunds)</strong>, and <strong>Processing Fee</strong>. A
            &quot;Collected&quot; number should filter Is Cash = true and sum Net Amount.
          </li>
        </ul>
        <p>Beyond plain columns, the builder supports:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Joins</strong> — on the Data card, tick <em>Client data</em> (invoices,
            payments, jobs, estimates, contracts) or the parent invoice / estimate (line items) to
            add that record&apos;s columns, shown as &quot;Client: …&quot;. Joined columns repeat on
            every row, so they&apos;re never added into totals. Using a join also requires access to
            the joined dataset.
          </li>
          <li>
            <strong>Client custom fields</strong> — every custom field defined in Settings appears
            as a &quot;Custom: …&quot; column on clients, invoices, payments, jobs, estimates and
            contracts, and can be filtered, grouped and aggregated like any column.
          </li>
          <li>
            <strong>Formulas</strong> — a calculated column can combine two columns, a column and a
            fixed number (e.g. × 100), or an earlier formula, and can be sorted on.
          </li>
          <li>
            <strong>Multi-level sort</strong> — sort by up to four columns (&quot;then by&quot;).
          </li>
        </ul>
        <p>
          Every report table also has a menu on each column header: <strong>sort</strong>,{" "}
          <strong>filter</strong>, <strong>aggregate</strong> (Sum, Average, Standard Deviation,
          Count, Distinct Count, Maximum, Minimum — shown as a footer row under the Totals row),{" "}
          <strong>format</strong> (alignment, number, currency, percent,
          timespan, true/false, color spectrum, bar gauges), <strong>merge duplicate cells</strong>{" "}
          and <strong>hide column</strong>. These change only what&apos;s on screen — exports and the
          saved report stay as run, so a color spectrum or bar gauge picked here isn&apos;t in
          downloads — and <em>Reset view</em> undoes them. The exception is <strong>aggregate</strong>{" "}
          footers: on the report page and the analysis builder, CSV, Excel and PDF downloads add
          the same summary rows, computed over the whole result rather than the filtered view
          (not on dashboards). In the analysis builder the aggregates you pick are{" "}
          <strong>saved with the analysis</strong>, so they come back when you reopen it and are
          added to its scheduled Excel and PDF sends (left off a partial, row-capped result, like
          the Totals row). Filters apply to the rows
          already loaded, and the totals row follows them.
        </p>
        <p>
          Saving or running a custom analysis requires the <strong>View Report Center</strong>{" "}
          permission, and some datasets additionally require a report permission — see{" "}
          <a href="#permissions" className="font-semibold underline">Permissions and gating</a>.
        </p>
      </Section>

      <Section id="dashboards-vs-reports" title="Dashboards vs. individual reports">
        <p>
          On the Reports page, the <strong>Custom Dashboards</strong> tab is described on screen
          as &quot;Multi-tab dashboards built from your saved analyses&quot;. A dashboard bundles
          one or more saved analyses into tabs. You can start from a blank dashboard or from a
          template &mdash; e.g. &quot;Sales Overview&quot; (estimate pipeline, win rate, recent
          activity), &quot;A/R Overview&quot; (outstanding balances, collections, payment
          activity), or &quot;Operations Dashboard&quot; — modeled on Service Autopilot&apos;s
          Operations Dashboard, with nine tabs (KPI&apos;s, Tickets, Profit / Loss, Upcoming Jobs
          - no contracts, Won Estimates by Service, Products/Bulk Material, Contracts, Services
          Insights, Projections) built mostly from reports that already exist in the Report
          Center. Click a saved dashboard in the list to open it.
        </p>
        <p>
          The same dashboards also appear in the <strong>Dashboards</strong> area (Home &gt;
          Dashboards). Whichever way you open one, it&apos;s the same dashboard &mdash; a change
          made in one place shows in the other.
        </p>
        <p>
          <strong>Panel dates.</strong> A tab can carry a shared date picker, and each panel
          chooses whether to follow it. A panel can instead pin its own relative window —{" "}
          <strong>Filter to today</strong>, <strong>Filter to yesterday</strong>,{" "}
          <strong>Month to date</strong>, or <strong>Year to date</strong> — computed in your
          company&apos;s time zone every time the dashboard loads. The templates use this for their annual
          gauges: &quot;Invoiced Revenue (YTD, pre-tax)&quot;, &quot;New Leads YTD&quot;, and &quot;New
          Clients / Converted Leads YTD&quot; are true January-1-to-today figures and{" "}
          <em>do not</em> move when you change the tab&apos;s date picker, so the gauge maximum
          keeps meaning an annual target.
        </p>
        <p>
          A panel whose dataset the signed-in user isn&apos;t allowed to query shows &quot;You
          don&apos;t have permission to view this panel&quot; in place of the chart — see{" "}
          <a href="#permissions" className="font-semibold underline">Permissions and gating</a>.
        </p>
      </Section>

      <Section id="payroll" title="The Payroll tab">
        <p>
          <strong>Payroll</strong> turns the crew&apos;s Start Day / End Day clock (see the Crew App
          guide) into hours per person per day, ready to correct and send to payroll. It is limited to{" "}
          <strong>admins and roles with the &quot;View &amp; Edit Payroll Report&quot; permission</strong>{" "}
          (Home → Report Access in the role editor): anyone else doesn&apos;t see the tab, and crew logins
          can&apos;t read it at all.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Pick the period.</strong> From / To dates, or the <strong>This week</strong>,{" "}
            <strong>Last week</strong> and <strong>Last 2 weeks</strong> buttons (weeks run Monday to
            Sunday, on your company&apos;s calendar &mdash; its timezone, not your computer&apos;s). It
            opens on last week. A single report covers at most 62 days.
          </li>
          <li>
            <strong>Paid time is the shift.</strong> Each person&apos;s day is clock-in at the shop to
            clock-out at the shop, less lunch and unpaid pauses. Whether a job pause is paid follows
            the visit&apos;s own override when the office set one, otherwise the company&apos;s
            &ldquo;Crew pauses are unpaid&rdquo; setting <em>as it was when that person&apos;s day
            ended</em> &mdash; each day keeps the setting it ended under, so changing it later only
            affects days ended after the change and never re-prices a past or locked pay period. A
            job&apos;s pause comes off a person only up to the time they were on that job, never more.
            A punch after midnight on a shift that started the evening before (storm work) counts
            on the day the shift started. The <strong>On jobs</strong> column
            is the part of that day spent on stops &mdash; the same punches Job Costing uses &mdash; so
            the gap is drive and shop time. If nobody tapped Start Day for a person, their job punches
            are used instead and the day is flagged.
          </li>
          <li>
            <strong>Totals by person.</strong> One row per employee with Day hours, On jobs, Extra,
            Total, <strong>Regular</strong> and <strong>OT</strong>. Click a row to open the day-by-day
            detail, which shows each day&apos;s regular and overtime hours too.
          </li>
          <li>
            <strong>Overtime.</strong> Each person&apos;s Total is split into Regular and OT hours by
            your company&apos;s overtime rule, set by an admin in{" "}
            <strong>Settings → Organization → Overtime</strong>: either hours over a weekly limit
            (default 40) in a Monday&ndash;Sunday week, or hours over a daily limit (default 8) in one
            day. The rule in use is printed above the table. A day&apos;s hours are its Total &mdash;
            day hours (or your override) plus Extra hours. With the weekly rule, days earlier in the
            same week count toward the limit even when your period starts mid-week, and the overtime
            lands on the day the limit is passed. Overtime hours are reported, not priced: apply the
            overtime pay rate in your payroll system.
          </li>
          <li>
            <strong>Correct any day.</strong> In the detail, change the <strong>clock-in and
            clock-out times</strong>, the <strong>unpaid break minutes</strong> (the number you enter is the
            day&apos;s whole unpaid break, replacing the recorded breaks rather than adding to them), or type the hours
            directly to override them (up to 48 hours for a day); add <strong>Extra</strong> hours
            (shop time, PTO, anything not on the clock, also up to 48); write a <strong>note</strong> saying why; and click <strong>Save</strong>. An
            end time earlier than the start is read as the next morning, for storm work past
            midnight. The reset arrow puts the day back to the recorded figures. Edited days show an{" "}
            <em>adjusted</em> badge.
          </li>
          <li>
            <strong>Nothing else changes.</strong> Corrections live only on the Payroll report. The
            recorded shifts and punches stay as they were, and Job Costing, job hours and the
            Timesheet report are not affected.
          </li>
          <li>
            <strong>Check badges.</strong> An amber <em>check</em> badge means a day needs a look:
            the shift was never ended (hours show as zero until someone taps End Day or you set the
            clock-out), a job punch is still open, or no one started the day for that person.
            &quot;Started at first job&quot; means the day was opened by the first Start Job rather
            than Start Day, so the real start was earlier.
          </li>
          <li>
            <strong>Export.</strong> The <strong>Export</strong> menu has Excel (a Totals sheet plus a
            Daily sheet), CSV of totals by employee, CSV of daily detail, and PDF. Every export has{" "}
            <strong>Regular Hours</strong> and <strong>OT Hours</strong> columns, per person and per
            day. Hours are numbers, so Excel and payroll uploads can add them up. The totals include a{" "}
            <strong>Days to Review</strong> count per person: days with a shift that was never ended
            (open) or with job time but no Start Day (no shift), where hours may be understated or
            missing. The PDF prints the totals by employee first, then a separate table for each
            employee with their days and a total row.
          </li>
          <li>
            <strong>Lock a pay period.</strong> After a period is exported and paid, an admin sets{" "}
            <strong>Lock payroll through</strong> at the top of the tab to its last day and taps{" "}
            <strong>Lock</strong>. From then on nothing dated on or before that day can change
            &mdash; day shifts, job punches and corrections alike, whether from Payroll, the dispatch
            board&apos;s Edit Job Times or the crew app. The pay-related parts of a visit on a locked
            day are locked too: its pause minutes, whether its pause is paid, and its clock-in and
            clock-out times (a visit counts as locked when it is scheduled on or before the lock date
            or carries a crew punch from a locked day). A job punch is dated the way Payroll pays it,
            so a 1&nbsp;a.m. punch on a storm shift that started the evening before is locked with
            that earlier day. Locked days show a <em>Locked</em> badge and
            can&apos;t be edited; anyone who tries is told &ldquo;Payroll is locked through &hellip;;
            ask an admin to move the lock date&rdquo;. The lock date must be before today. To fix a
            locked day, an admin moves the lock back (<strong>Move lock</strong>) or taps{" "}
            <strong>Unlock</strong>, makes the change, and locks again. Every move of the lock date is
            in the organization&apos;s change history. Only admins can move it; everyone with Payroll
            sees it. A shift from a locked day that was never ended stays open (End Day can&apos;t close
            it) until an admin unlocks the day to fix it.
          </li>
        </ul>
        <Callout>
          Payroll reads the crew&apos;s roster, so an employee has to be on a crew (Team → Crews → Team
          Assignments, or placed on one for the day on the Crew Board) to be clocked in by Start Day.
          Someone marked <em>Not working</em> in Edit Crew is skipped. Someone deactivated or taken
          off the crew partway through a day still has that day&apos;s shift closed by End Day, and
          the office can still correct the punches they already had. Every change to a shift and
          every correction made here is kept in the audit history. Payroll reports regular and
          overtime hours but not pay amounts &mdash; apply pay rates in your payroll system.
        </Callout>
      </Section>

      <Section id="graphics-library" title="The Graphics Library">
        <p>
          The <strong>Graphics Library</strong> tab holds ready-made panels you can drop into any
          dashboard with <strong>Add to Dashboard</strong>, plus panels you saved yourself. Panels come
          in these visual types: KPI, table, bar, line, pie, gauge, crosstab and{" "}
          <strong>pipeline</strong>.
        </p>
        <p>
          <strong>Pipeline</strong> lists stages top to bottom, each with its total and a bar sized to
          the largest stage. <strong>Sales Pipeline Insight</strong> uses it for estimate value by
          stage: Draft, Quoted, Proposed (sent), Won, Invoiced and Lost. Pick Pipeline as the visual
          type on any panel with a stage-style label column and one value column.
        </p>
        <p>
          <strong>Monthly trends.</strong> Two graphics group a daily query into one point per month:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Labor Efficiency by Month</strong> — a line chart of budgeted vs. actual man-hours
            on worked visits. Actual under budget means crews beat the estimate.
          </li>
          <li>
            <strong>Drive Time by Month</strong> — total crew drive minutes per month. It reads the
            separate crew drive-time records, so it is its own chart and not a third line on Labor
            Efficiency.
          </li>
        </ul>
        <p>
          Both follow the dashboard tab&apos;s shared date range. They add up the days within each
          month, so they suit totals like hours and minutes.
        </p>
      </Section>

      <Section id="curated-dashboards" title="The ready-made dashboards">
        <p>
          Separate from anything you build, the <strong>Dashboards</strong> area (the{" "}
          <strong>Dashboards</strong> tile on the Home screen) has a fixed set of ready-made
          dashboards. They&apos;re listed on its <strong>Overview</strong> page and in its
          sidebar:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Dashboard</th>
              <th className="px-3 py-2">What it shows</th>
              <th className="px-3 py-2">Who sees it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {CURATED_DASHBOARDS.map(([name, shows, gate]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{shows}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{gate}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          The Overview page and sidebar list these plus any Custom Dashboards you&apos;ve built.
          &quot;Reports Dashboard&quot; is worth calling out: it isn&apos;t part of the Report
          Center at all &mdash; it&apos;s Landscapt&apos;s original built-in reporting page, which
          the Reports page also shows on its <strong>Dashboard</strong> tab.
        </p>
      </Section>

      <Section id="kpi-scorecard" title="The KPI Scorecard">
        <p>
          <strong>Dashboards &gt; KPI Scorecard</strong> is an annual goals card: metrics grouped
          into categories (Financial, Operations, Sales, People by default), each with a{" "}
          <strong>Target</strong>, an <strong>Actual</strong>, a progress bar, and a percent
          weight. Every company gets one scorecard, created from the default layout the first time
          someone opens the page, and the year selector in the header switches which calendar year
          you are scoring.
        </p>
        <p>
          Metrics come in two kinds, and the badge on the Actual cell tells you which:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Auto</strong> — computed live from Landscapt data every time the page loads
            (invoices, payments, jobs, visits, timesheets, estimates, clients, employees, tickets).
            Nothing is cached, so the number is never stale. Hover the <em>auto</em> badge for the
            exact definition. Revenue metrics count issued invoices only (no drafts or voids) and
            exclude sales tax, and
            Cash Collected counts cash payments only — no account credits or AR write-offs, net of
            refunds. A dash means there was nothing to compute from for that year — for
            example Revenue (Sold) needs jobs with a Date Sold, and Maintenance Retention needs
            recurring or package jobs that existed before January&nbsp;1. AR Outstanding and AR Over
            60 Days are always as of today, so AR Days (today&apos;s open balance ÷ the year&apos;s
            average daily invoicing) is left blank when you score a past year. A package counts as
            retained only when its program window reaches the year you are scoring, so last
            season&apos;s package that wasn&apos;t renewed counts as lost. Metrics built on visit
            labor cost (Gross Profit, Labor % of Revenue, Revenue per Man-Hour) need one of the
            job-costing report permissions, the same as the Job Costing reports.
          </li>
          <li>
            <strong>Manual</strong> — click the Actual cell and type the value. These are things
            Landscapt has no source for: NOI and net margin, overhead ratio, AP days, labor
            efficiency against payroll hours, fleet safety score, eNPS, training hours, training
            completion, absenteeism, plus any custom metric you add. Accident Free Workdays is
            calculated, not manual &mdash; it comes from Injury Cases; see the Injury &amp;
            Near-Miss Cases guide.
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
          the same permission that gates building Custom Dashboards and custom analyses. Admins
          always have it; of the default roles, Owner and Operations Manager have it and the rest
          (Accounting, Office Admin, Sales / Account Mgr, Scheduler, Customer Support Rep) are
          view-only. Without it the Customize button is hidden and the cells are read-only, and a
          change is refused even if someone tries to make it another way. Crew logins have neither
          permission, so they cannot reach the page at all. Roles are managed under{" "}
          <strong>Settings &gt; Landscapt Settings &gt; Roles</strong>.
        </p>
        <p>
          The layout is saved once for your whole company; targets and manual actuals are saved
          separately for each year. Only people in your company can see either.
        </p>
      </Section>

      <Section id="company-report" title="The Company Report">
        <p>
          <strong>Dashboards &gt; Company Report</strong> is a live, always-current sales and
          operations snapshot, computed entirely from Landscapt data. It has no filters or date
          picker — it&apos;s always &quot;as of now&quot;: year-to-date figures run from January 1
          of the current year, and the monthly tables cover the trailing three calendar months,
          the current one as month-to-date.
        </p>
        <p>
          Every number comes from the same report engine and datasets the Report Center uses
          (Clients, Estimates, Invoices), plus direct look-ups of payments, invoices, and tickets
          for the handful of figures — per-client aging buckets, cash-only payment totals, ticket
          assignee counts — that a simple grouped report can&apos;t produce.
        </p>
        <p>The page has four sections:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>KPI row</strong> — Invoiced Revenue, Outstanding A/R, New Clients, and New
            Leads, year-to-date. The progress bars under Invoiced Revenue, New Clients, and New
            Leads read the matching Target from your KPI Scorecard — set a target there and it
            shows up here automatically.
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
          <strong>Flags &amp; Priority Actions</strong> are rule-based, not AI-generated. They
          check a fixed set of thresholds against the same numbers on the page — e.g. any client
          with a large balance over 90 days past due, more than 30% of A/R in the two oldest
          buckets, a meaningful pile of unused pre-payments, several unassigned tickets, revenue
          running behind a pace-adjusted annual target. No account gets free-form judgment or a
          narrative explanation; a flag either fires past its threshold or it doesn&apos;t. The
          thresholds are the same for every company and can&apos;t be changed from the page.
        </Callout>
        <p>
          Access works like the rest of the Report Center: you need <strong>View Report
          Center</strong> plus <strong>View Company Report</strong> to open it, your plan must
          include Landscapt, and crew logins don&apos;t see it. The close ratio, open pipeline and
          won-estimate cards also need one of the estimate report permissions; without one they
          are replaced by a short note. There&apos;s nothing to edit on this page, so there&apos;s
          no separate Manage Report Center permission for it, unlike the KPI Scorecard.
        </p>
      </Section>

      <Section id="social-media" title="The Social Media dashboard">
        <p>
          <strong>Dashboards &gt; Social Media</strong> tracks your social accounts week by week.
          Nothing is pulled in automatically — someone logs each week&apos;s numbers by hand,
          copied from each platform&apos;s own Insights/Analytics page.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Log a Week</strong> — pick a Monday–Sunday week, then fill in one column per
            platform: posts, views/reach, profile views, likes, comments, shares, saves, total
            followers, net new followers, leads and notes. Leave anything you don&apos;t know blank
            rather than typing 0; platforms left completely blank aren&apos;t saved. If you type
            Total followers, Net new followers works itself out from the previous week&apos;s total.
          </li>
          <li>
            <strong>Overview</strong> — KPI cards (posts, views, profile views and profile view
            rate, engagements and engagement rate, net new followers, leads) with the change versus
            the previous period, a follower snapshot, and weekly charts. Use the platform chips and
            the date-range menu (last 4 or 12 weeks, this month, last month, year to date, all time)
            to narrow it.
          </li>
          <li>
            <strong>Platforms &amp; Monthly, Weekly Log</strong> — a side-by-side platform
            comparison, a monthly summary and the full weekly history, where a logged week can be
            edited or deleted.
          </li>
          <li>
            <strong>This Month vs. Goals</strong> — content published, engagement rate, leads and
            follower growth against a minimum and a stretch goal. A goal shows &quot;On track&quot;
            once it reaches the minimum. <strong>Edit goals</strong> changes the targets for your
            whole organization (Reset to defaults restores the starting ones).
          </li>
          <li>
            <strong>Add / hide platforms</strong> — the dashboard starts with Facebook, Instagram,
            TikTok, YouTube and LinkedIn. Add your own (for example Google Business or Nextdoor),
            reorder them, or hide ones you don&apos;t use; hiding keeps the past numbers.
          </li>
        </ul>
        <p>
          Anyone allowed to see the dashboard can read it. Admins and managers can always log weeks
          and edit goals and platforms; give another role the <strong>Social Media: Enter &amp; Edit
          Data</strong> permission (Settings &gt; Landscapt Settings &gt; Roles) to let, say, a marketing
          coordinator do it without broader access.
        </p>
      </Section>

      <Section id="audit-trail" title="Audit trail: per-record tabs and the company-wide log">
        <p>
          There are two ways to see who changed what. Most detail panels and dialogs —
          Clients, Jobs, Invoices, Estimates, Contracts, Packages, Services, Tickets, damage
          cases, Purchase Orders, Requisitions, Receiving, Projects, Products, Employees, Crews,
          Schedules (the recurrence definitions behind recurring jobs), and on the Equipt side
          Assets, Work Orders, PM Schedules, Parts, and Vehicles — have their own{" "}
          <strong>Audit Trail</strong> tab, showing the history of that one record. The{" "}
          <strong>Automation</strong> builder has one too; it shows a single history for the whole
          rule, because changes to its sequences, triggers, and conditions all appear on the
          automation itself.
        </p>
        <p>
          For records you don&apos;t already have open, the <strong>Audits</strong> section of the
          Report Center has three company-wide reports: <strong>Audit Log</strong> (the full
          trail, filterable by category, record type, user, and action, with a{" "}
          <strong>Record</strong> column naming the estimate, invoice, PO, client, contract,
          project, job, service, package or crew that was changed),{" "}
          <strong>Security &amp; Access Audit</strong> (permission, user, credential, and
          approval-chain changes only, defaulting to a 90-day window), and{" "}
          <strong>Change Activity by User</strong> (a count of changes per person, grouped by
          record type — useful for spotting an unexpected burst of edits).
        </p>
        <p>
          <strong>What an entry captures.</strong> Every field that changed in a save is recorded
          &mdash; a save that changed both the status and the price shows both. Money is shown in
          dollars. Some events read as a plain-language decision rather than a list of fields —
          an approval step reads &quot;Approval step 2 approved by Dana Reyes — &apos;ok to
          order&apos;&quot;, a change order reads &quot;Change order CO #99 Extra pavers approved —
          $4500.00&quot; — and appear on the requisition, PO, estimate, or project being approved.
          Each entry names the person who made the change, not whoever originally created the
          record (except for the entry that records its creation). Line-item entries on Purchase
          Orders and Requisitions show the before and after in the entry itself (for example
          &quot;quantity 4 → 6&quot; or &quot;unit cost $12.50 → $14.00&quot;), changes to a PM
          schedule&apos;s default assignee are recorded, and list-type values are shown as plain
          text.
        </p>
        <p>
          <strong>What&apos;s deliberately hidden.</strong> Changes to credentials (API keys,
          third-party integrations, sign-in connections) are recorded, but the secret values are
          not — an entry says a credential changed, never what it changed to or from. A user
          moving between organizations is recorded against the organization they{" "}
          <em>left</em>, not the one they joined, so the move stays visible to the company it
          happened to.
        </p>
        <p>
          <strong>What&apos;s covered.</strong> History is kept for the records listed above, and
          changes to their parts show on the parent record&apos;s Audit Trail tab: payments and
          how they&apos;re applied, milestones, a job&apos;s services, products and materials,
          crew member times, chemical applications, contract services, client properties and
          contacts, employees, roles, discounts, and overhead settings. The Products screen shows
          receiving and usage history, and project change orders and schedule edits are recorded
          too. A change to something not covered won&apos;t appear in the trail. Entries are
          written automatically when a record changes &mdash; nobody can add, edit or delete an
          audit entry from the app, so the trail can be relied on as a record of what happened.
        </p>
      </Section>

      <Section id="export" title="Exporting, printing, and scheduled delivery">
        <p>
          Every pre-built report and custom analysis offers four output buttons once a result has
          rows:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>CSV</strong> — a plain spreadsheet file.</li>
          <li><strong>Excel</strong> — an .xlsx workbook.</li>
          <li><strong>PDF</strong> — a formatted PDF of the report.</li>
          <li><strong>Print</strong> — your browser&apos;s print dialog; the filter bar and page header are left off so only the table prints.</li>
        </ul>
        <p>
          All three downloads end with a <strong>Totals</strong> row matching the one on screen
          (per-group subtotals for grouped reports). If the on-screen result was truncated at
          5,000 rows, the export is too — and its totals cover only those rows.
        </p>
        <p>
          <strong>Paper size.</strong> PDFs and printouts use US <strong>Letter</strong>. A report
          PDF is portrait, and switches to landscape when any section has more than six columns.
          Ticket printouts are Letter portrait. On a <strong>dashboard</strong>, the PDF button
          opens the browser print dialog with the page laid out as shown (charts, KPI tiles and
          tables, Letter landscape, with the dashboard and tab name as a heading) &mdash; choose{" "}
          <strong>Save as PDF</strong> as the destination.
        </p>
        <p>
          <strong>Scheduled delivery.</strong> Reports that can be scheduled — currently the five
          fixed-window <em>Actual v. Budgeted Hours</em> reports (Today, Yesterday, Week to Date,
          Last Week, Month to Date) — show a <strong>Schedule</strong> button on the report page,
          and the <strong>Scheduled</strong> tab lists every schedule. A schedule emails the report to
          one or more recipients <strong>once</strong>, <strong>daily</strong>,{" "}
          <strong>weekly</strong> (on the days you tick) or <strong>monthly</strong> (a day of the
          month, or e.g. the last Friday), between an optional start and end date, as a{" "}
          <strong>PDF</strong> or an <strong>Excel</strong> file, with an optional custom{" "}
          <strong>subject</strong> and <strong>message</strong>. The send time is an hour of the
          day on your company&apos;s clock (Settings &gt; Organization), and times inside the file
          and the date ranges the report covers use that time zone too. Schedules are checked
          every hour, and each one goes out on the{" "}
          <strong>first check at or after its scheduled hour</strong> — so a 7 AM schedule goes out
          at 7 AM, or at 8 AM if the 7 AM check ran late — and never twice in the same
          day. Creating a schedule, changing its recipients or turning it back on needs Manage
          Report Center <em>and</em> permission to view the report itself, because the email goes
          out without checking the recipient&apos;s role. If a scheduled report matches more rows
          than a report can return at once, the emailed file says it is partial
          (&quot;only the first N of M rows&quot;) and leaves off the totals row.
        </p>
        <p>
          <strong>Scheduling a saved custom analysis.</strong> In <em>My Reports</em>, choose{" "}
          <strong>Schedule…</strong> on a saved analysis (or pick it in <em>New Schedule</em>).
          Analyses on any dataset can be scheduled, except ones that use joined datasets. Because a saved analysis stores fixed dates, you can add a{" "}
          <strong>date window</strong>: pick a date column and a rolling range — Yesterday, Last 7
          or 30 days (through yesterday), Month to date, This month, Last month, Year to date, This
          year or Last year — and the range is recalculated on your company&apos;s calendar every
          time it sends. Each send uses the analysis as it is saved <em>at that moment</em>, and
          checks that the person who created the schedule still has Report Center access and
          permission for the dataset; if not, or if the analysis was deleted, nothing is sent and
          the schedule shows the reason in its last-run column (a deleted analysis pauses its
          schedules).
        </p>
        <p>
          <strong>When the creator is deactivated.</strong> Every schedule runs as the person who
          created it. When that person is deactivated, their schedules are paused right away (the
          Scheduled tab shows &quot;Paused: the person who created this schedule was
          deactivated&quot; and &quot;Created by … (deactivated)&quot;), and their own email address is
          removed from those schedules&apos; recipients. Nothing is sent while it is paused. An Admin
          can choose <strong>Take over &amp; resume</strong> from the schedule&apos;s menu: the Admin
          becomes the schedule&apos;s owner and it starts sending again. If no recipients are left, the
          schedule is taken over but stays paused and the editor opens so you can add some first.
          Other roles see Resume disabled until an Admin takes the schedule over.
        </p>
      </Section>

      <Section id="permissions" title="Permissions and gating">
        <p>
          Who sees which reports and dashboards depends on your plan, on a few dashboards that are
          specific to one company, and on each person&apos;s role:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your plan</strong> &mdash; the Equipt Dashboard appears only when your plan
            includes Equipt; Landscapt My Day, the Reports Dashboard, the KPI Scorecard and the
            Company Report appear only when it includes Landscapt.
          </li>
          <li>
            <strong>Advanced Reporting add-on</strong> &mdash; custom analyses (&quot;My
            Reports&quot;), Custom Dashboards, the Graphics Library and scheduled delivery need the
            add-on on Starter and Growth (it&apos;s included on Enterprise and during a trial). The
            built-in Sales Overview, A/R Overview and Operations Dashboard stay viewable on every
            plan as shipped. This
            is checked every time one of them opens, runs, saves or sends, not just by hiding tabs.
          </li>
          <li>
            <strong>Company-specific dashboards</strong> &mdash; Financial, Labor Efficiency and
            Driver Safety Scores are built for one company&apos;s own data and don&apos;t appear in
            other accounts, even if someone opens their web address directly.
          </li>
          <li>
            <strong>Crew logins</strong> &mdash; crews don&apos;t see the KPI Scorecard, Company
            Report, Financial or the office dashboards, and opening their web address directly is
            blocked too. They only see dashboards marked visible to crews (and reports built on
            jobs and visits return no data to them, because those include prices).
          </li>
          <li>
            <strong>Per-dashboard View permissions</strong> — each built-in dashboard also has a{" "}
            <em>View …</em> permission in the CRM role editor (View Equipt Dashboard, View My Day,
            View KPI Scorecard, View Company Report, View Social Media, View Custom Dashboards,
            View Job Costing, View Estimate Builder, View Calculators and so on). A dashboard a
            role can&apos;t view is hidden from the sidebar and Dashboards home and blocked if
            someone opens its web address. Admins always see everything.
          </li>
          <li>
            <strong>Custom Dashboards need Landscapt</strong> &mdash; Custom Dashboards are a
            Landscapt feature. If your plan doesn&apos;t include Landscapt, they don&apos;t appear
            on the Dashboards home page and opening one directly is blocked.
          </li>
        </ul>
        <p>
          The KPI Scorecard is the one reporting page with a view/edit split: View Report
          Center to open it, Manage Report Center to change targets, manual actuals, or the
          layout (see the KPI Scorecard section above).
        </p>
        <p>
          On top of that, CRM role permissions (Settings &gt; Landscapt Settings &gt; Roles, Reports
          tab) control the Report Center itself, and they are checked every time a report runs,
          not just by hiding buttons:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>View Report Center</strong> is required for custom analyses, saved reports
            (&quot;My Reports&quot;), Custom Dashboards, and the Graphics Library. Without it they
            won&apos;t open, run or save, even if a link to them is visible somewhere.
          </li>
          <li>
            <strong>Per-report permissions.</strong> Most pre-built reports have a permission of
            the same name in the role editor&apos;s CRM Reports, Scheduling Reports, and
            Accounting Reports sections. A report with no permission of its own is visible to
            anyone who can reach the Report Center.
          </li>
          <li>
            <strong>Per-dataset permissions for your own analyses.</strong> A custom analysis or
            dashboard panel can pull any column of its dataset, so the sensitive datasets also
            require a matching report permission — otherwise anyone with View Report Center could
            pull pay rates or invoice history a role was meant to hide. Any one of the listed
            permissions is enough:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Employees</strong> — Employee Directory.</li>
              <li><strong>Timesheets</strong> — Job Hours Summary or Employee Directory.</li>
              <li><strong>Crew Drive Time</strong> — Job Hours Summary.</li>
              <li><strong>Job Visits</strong> and <strong>Job Services</strong> — Job Costing, Job Cost Summary, Cost of Goods Sold Report, or Job Hours Summary.</li>
              <li><strong>Projects — WIP Schedule</strong> — Job Costing or Job Cost Summary.</li>
              <li><strong>Contracts</strong> — Client Contracts, Package Summary Report, or any of the three invoice permissions below.</li>
              <li><strong>Invoices</strong> and <strong>Invoice Line Items</strong> — Invoiced Income by Client, Invoices with Balances, or A/R Aging Report.</li>
              <li><strong>Payments</strong> — Payment Audit Summary, or any of the three invoice permissions above.</li>
              <li><strong>Estimates</strong> and <strong>Estimate Line Items</strong> — View Estimates, Estimates by Stage, or Won Estimates by Service.</li>
              <li><strong>Audit Log</strong> — Audit Log or Security &amp; Access Audit.</li>
            </ul>
            Every other dataset (clients, contacts, client timeline, address verification, jobs,
            services, products, vendors, chemicals, field upsells, tickets, sales-rep month,
            contract usage) needs only View Report Center.
          </li>
          <li>
            A dashboard panel the signed-in user can&apos;t query is not an error — it shows
            &quot;You don&apos;t have permission to view this panel&quot; and the rest of the
            dashboard loads normally. Admins aren&apos;t limited by CRM role permissions.
          </li>
        </ul>
        <p>
          Whatever a role is allowed to run, a report only ever returns your own company&apos;s
          data &mdash; permissions decide which reports and datasets a person can use, and every
          result is limited to your organization&apos;s records.
        </p>
      </Section>
    </DocsFontScope>
  );
}
