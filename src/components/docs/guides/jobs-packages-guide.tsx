import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const JOB_TYPES: [string, string, string][] = [
  ["Recurring", "A repeating service on a schedule — mowing every week, fertilizer every 5 weeks. Generates a visit for each occurrence, through an optional End Date.", "Convert Estimate to Job, or Jobs → Add Job"],
  ["One Time", "A single visit, no recurrence.", "Convert Estimate to Job, or Jobs → Add Job"],
  ["Project", "A one-off landscaping job tracked separately from recurring service — the Landscapt equivalent of a cost-tracking bucket, for a job like a patio install or a large cleanup.", "Convert Estimate to Job, or Jobs → Add Job"],
  ["Waiting List", "No fixed date — only a date range. Surfaces on the Waiting List page for opportunistic dispatch when a crew is nearby.", "Convert Estimate to Job, or Jobs → Add Job"],
  ["Package", "A bundled recurring service program (e.g. a 7-Step Fertilizer plan) billed as one fixed monthly amount.", "Convert Estimate to Job (for packages added to the estimate), or Jobs → Add Job"],
  ["Snow", "Storm-based scheduling and service entry — snow/ice events rather than calendar dates.", "Jobs → Add Job only — not converted from an estimate"],
];

export function JobsPackagesGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Jobs & Packages"
        description="The six job types, how a job's status differs from a visit's status, and how a Package template turns into a billed job."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#job-types">The six job types</TOCLink>
          <TOCLink href="#creating-jobs">Creating a job</TOCLink>
          <TOCLink href="#job-value">Where a job&apos;s value comes from</TOCLink>
          <TOCLink href="#job-notes">Job notes</TOCLink>
          <TOCLink href="#job-costing-tab">The Job Costing tab</TOCLink>
          <TOCLink href="#jobs-list">Finding jobs on the Jobs list</TOCLink>
          <TOCLink href="#job-vs-visit-status">Job status vs. visit status</TOCLink>
          <TOCLink href="#equipment">Equipment to bring</TOCLink>
          <TOCLink href="#packages">Packages, in detail</TOCLink>
          <TOCLink href="#package-renewal">Renewing a package for next season</TOCLink>
          <TOCLink href="#projects">Projects (Landscapt vs. Equipt/PO)</TOCLink>
          <TOCLink href="#recurring-setup">Setting up a recurring job</TOCLink>
          <TOCLink href="#schedule-templates">Schedule templates</TOCLink>
          <TOCLink href="#see-also">See also</TOCLink>
          <TOCLink href="#good-to-know">Good to know</TOCLink>
        </div>
      </div>

      <Section id="job-types" title="The six job types">
        <p>
          Every job in Landscapt&apos;s <code>crm_jobs</code> table is exactly one <code>job_type</code>:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">What it&apos;s for</th>
              <th className="px-3 py-2">How it&apos;s created</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {JOB_TYPES.map(([name, desc, created]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{created}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Dispatch Board, Waiting List, and Snow Jobs each get their own deep-dive guide — this page
          covers job types broadly, and goes deep on Packages and Projects specifically. See{" "}
          <strong>See also</strong> below for the others.
        </p>
      </Section>

      <Section id="creating-jobs" title="Creating a job">
        <p>Two paths onto the schedule:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Convert to Job</strong> — from an accepted estimate, pick a Job Type of{" "}
            <strong>One Time</strong>, <strong>Recurring</strong>, <strong>Project</strong>, or{" "}
            <strong>Waiting List</strong>. The estimate&apos;s services, quantities, pricing (net of
            any discounts), and crew size carry over onto the job. See the Estimating guide for the
            full walkthrough.
          </li>
          <li>
            <strong>Jobs → Add Job</strong> — the direct path for any type. The dialog opens with a{" "}
            <strong>Job Type</strong> selector (One Time, Recurring, Package, Project, Waiting List,
            or Snow, as available to your org); switching type swaps in that type&apos;s own fields.
            A <strong>Snow</strong> job can only be created here. A <strong>Package</strong> job can
            be created here, or by converting an estimate that has the package on it (see below).
          </li>
        </ul>
        <p>
          The <strong>client picker</strong> in Add Job is searchable — type part of a name or an
          account number to find the account. It has its own full-width row at the top of the dialog.
          Once a client is picked, the Service Address picker spells out the actual address for each
          choice (the client&apos;s main address, or each property), and a{" "}
          <strong>Service address</strong> line under it shows where the crew will be sent, noting when
          it fell back to the client&apos;s billing address. Only clients appear in the picker:
        </p>
        <Callout>
          <strong>Leads can&apos;t have jobs.</strong> Leads and lost leads are left out of the
          picker, and the system refuses to create a job for one no matter where the request comes
          from (in-app, API, Zapier, or an import) — you&apos;ll get an error telling you to convert
          the lead first. Open the lead, click <strong>Convert to Client</strong>, confirm, and then
          create the job. See the Clients guide for what conversion does.
        </Callout>
        <p>What each type asks for in Add Job:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Recurring</strong> — a service, a schedule, a Start Date, and an optional{" "}
            <strong>End Date</strong> (the season end). When a schedule and start date are set, the
            visits are generated automatically the moment the job is created — no separate step.
            Later, <strong>Generate Visits</strong> on the job fills in anything missing through the
            End Date (or through the end of the year when no End Date is set), up to 60 visits per
            run; a job whose End Date has already passed generates nothing. If nothing could be
            generated (for example the schedule can&apos;t be read, the start date is past the end or the
            horizon, or the client or contract is inactive), the button says so instead of reporting that
            everything is up to date. The <strong>Start Date</strong> and <strong>End Date</strong> can
            be changed later on the job&apos;s Job Settings (Edit): like a schedule change, you&apos;re
            shown how many untouched upcoming visits the new dates drop, those are removed, and the
            new dates are filled in. A recurring job has no separate Scheduled Date to edit — its Start
            Date is what the schedule runs from.
          </li>
          <li>
            <strong>Visit caps and skipped visits.</strong> A service converted from an estimate line
            priced over a number of visits (say 30 mows) is capped at that many visits. Only
            scheduled, dispatched, in-progress and completed visits count toward the cap: a visit
            that is skipped, cancelled or deleted is made up — the generator adds another visit later
            in the season, within the job&apos;s End Date.
          </li>
          <li>
            <strong>Schedules need to be set up first.</strong> A recurring job&apos;s schedule is picked from
            the templates under Settings → Schedules. If your company has none yet, the dialog shows a
            text box that only accepts wording the system can read (&ldquo;Weekly Monday&rdquo;,
            &ldquo;Bi-weekly Thursday even&rdquo;, &ldquo;Every 3 weeks Tuesday&rdquo;); anything else is
            refused with a pointer to Settings → Schedules, because it would save a job that never gets visits.
          </li>
          <li>
            <strong>Package</strong> — pick the package program and a Start Date. Each step&apos;s date
            window and rate are seeded from the package template (rates default from the package or
            the service&apos;s own pricing). <strong>Changing the Start Date shifts every step window
            by the same number of days</strong>, so a program that starts two weeks late re-anchors
            as a whole instead of leaving its steps on the template dates. A package whose dates
            are from an earlier season starts today instead (every step keeps its spacing), and the
            dialog tells you so. A step with <strong>Visits Included</strong> above 1 adds that many
            rows, one per visit, each at the step&apos;s rate. The dialog shows the
            billing summary as <strong>Monthly $X · Total $Y</strong> — the total is the sum of the
            step rates, spread evenly over the months the program covers.
          </li>
          <li>
            <strong>Snow</strong> — service, days authorized, inch trigger, invoice type, and rate.
            Picking a service fills in its default rate only while the rate is still blank; a rate
            you&apos;ve already typed is never overwritten by choosing a service afterward. The
            invoice type controls the Services table: Per Event, Per Inch and Per Push take one
            service and price from the depth ranges (the service Rate shows <em>Not used</em>),
            Hourly takes one service whose Rate is the hourly rate, Monthly Flat Rate bills only
            through a contract you must choose, and Per Event sums any number of services. Make one
            snow job per service.
          </li>
          <li>
            <strong>One Time</strong>, <strong>Project</strong>, <strong>Waiting List</strong> — a
            service line (or several), date or date range, crew, and team size. Quantity boxes accept
            decimals such as 0.5 or 0.01 when typed, but the up and down arrows move by 1. On a typed
            service row, <strong>B. Hrs</strong> is the <strong>total</strong> budgeted hours for the
            whole crew for one visit; the hours per person are that total ÷ Team (stored rounded to
            four decimals). Changing Team keeps the total and re-splits it, so typing 0.25 with a team
            of 3 gives 0.25 total (0.083 each) in either order. The calculator icon beside the box
            builds the number from Men × Hrs:Min (2 men × 1:30 = 3.00) and sets Team to match.
          </li>
        </ul>
        <p>
          The <strong>Team / Men</strong> count entered in the dialog lands on the job&apos;s visits,
          so the Dispatch Board&apos;s Men column shows the right headcount from the first visit.
        </p>
      </Section>

      <Section id="job-value" title="Where a job's value comes from">
        <p>
          A job&apos;s dollar value is the <strong>sum of its included service lines</strong>. That
          one number is what the Dispatch Board&apos;s <strong>AMT</strong> column, the visit detail
          sheet&apos;s costing, and the <strong>Jobs</strong> card on the client record all show — so
          re-pricing a service line on the job updates every one of those places at once, and the
          three can no longer drift apart.
        </p>
        <p>
          <strong>Removing a service</strong> (the trash icon on the Services tab) removes that
          service&apos;s upcoming visits — today onward, scheduled or dispatched, not started and not
          invoiced. What happens to the service itself depends on its history:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            With no other visits and no products on record, the service is deleted.
          </li>
          <li>
            With past, completed, skipped or in-progress visits (or products) on record, it is{" "}
            <strong>Stopped</strong> instead: it stays on the Services tab, greyed out with a Stopped
            badge, no new visits are scheduled for it, and it no longer counts toward the job&apos;s
            price, total or budgeted hours. Its past visits stay linked to it, so reopening or
            re-completing one still bills only that service — never the whole job. Removing it again
            once those visits are gone deletes it. On a job that has already been invoiced, stopping
            a service needs permission to modify invoices.
          </li>
        </ul>
        <p>
          The job&apos;s other services keep their visits and keep generating as before.
        </p>
      </Section>

      <Section id="job-notes" title="Job notes">
        <p>
          A job has two notes, both on the job&apos;s <strong>Notes</strong> tab and on the Overview:{" "}
          <strong>Notes to Crew / Job Notes</strong> (instructions the crew reads on the stop) and{" "}
          <strong>Internal Notes</strong> (office only). Both are rich text, so you can use bold,
          italic, underline, bulleted and numbered lists, and left, center or right alignment. Use a list for equipment and a numbered
          list for steps and the crew sees the same layout on their phone.
        </p>
        <p>
          Formatting shows wherever notes are read in full: the job, the visit sheet banner and the
          crew app&apos;s Job Notes. Anywhere a note has to fit in one line or in plain text, the
          formatting is dropped and the words are kept: board cells and exports, the waiting list,
          printed route sheets, and push notifications. Notes you type directly on a visit (Notes to
          Crew on the visit sheet) are plain text.
        </p>
        <Callout>
          Changing a job&apos;s crew note resets the crew&apos;s &quot;I&apos;ve read this&quot;
          acknowledgment, so they have to read it again before they can clock in.
        </Callout>
        <p>
          <strong>Editing the crew note updates upcoming visits.</strong> Each generated visit
          carries a copy of the job&apos;s crew note. When you change the note on the job, the
          upcoming visits (scheduled or dispatched, not yet started) that still hold the unchanged
          copy get the new text, so a new gate code reaches the crew on the next stop. A note someone
          typed on one particular visit is left alone.
        </p>
        <p>
          <strong>Changing the job&apos;s crew moves its upcoming visits.</strong> Upcoming visits
          (today onward, not started, completed, skipped or cancelled) that follow the job&apos;s
          crew — ones with no crew of their own or still on the job&apos;s old crew — move to the new
          crew. A visit you moved to a different crew on the Dispatch Board, a visit pinned to
          &ldquo;no crew&rdquo;, and multi-crew stops keep their crews.
        </p>
        <p>
          <strong>Per-service notes.</strong> Each service on a job can carry its own crew note,
          invoice description and internal note (they come over from the estimate line&apos;s Notes,
          or are set on the service). In Add Job, each service line has a <em>Service notes &amp; invoice
          description</em> section you can expand; on an existing job, edit the service on its Services
          tab to change all three. A visit for one service shows the job note followed by that
          service&apos;s note; a single visit that does the whole job shows the job note followed by
          every service&apos;s note, so a &quot;use black mulch&quot; line note reaches the crew however
          the job is scheduled (Add Job, Convert, Waiting List dispatch, Nearby or Add Visit). Editing
          the job note or a service note updates upcoming visits the same way as above. The service&apos;s
          invoice description is used on that service&apos;s invoice line by every invoice button and
          by auto-invoicing; the job&apos;s Invoice Description fills in for services without one. The
          internal note is office-only: crew logins can&apos;t read it, in the app or otherwise.
        </p>
        <p>
          <strong>Adding a visit by hand.</strong> On the job&apos;s Visits tab, Add Visit lets you
          pick a crew or choose <strong>Unassigned</strong>, which pins that visit to no crew instead
          of falling back to the job&apos;s crew. The date defaults to your organization&apos;s
          today.
        </p>
      </Section>

      <Section id="job-costing-tab" title="The Job Costing tab">
        <p>
          The <strong>Job Costing</strong> tab compares what a job was expected to take with what it
          actually took. Its figures come from the same visit data the Job Costing and COGS reports
          use, so the tab and the reports agree. Only visits that were worked (completed or in
          progress) count as actuals. Revenue is the pre-tax amount, so sales tax never inflates profit.
          Materials include products the crew recorded as used on the job (at their unit cost) as well as
          materials added on the Costs tab, and the estimated cost includes the estimate&apos;s equipment
          and sub-item costs.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Labor Hours</strong> — man-hours from the worked visits (people × time, net of
            breaks), compared with the estimate&apos;s budgeted hours.
          </li>
          <li>
            <strong>Labor Cost</strong> — the crew&apos;s real punch cost when they clocked in and
            out. Visits finished without punches are costed as hours × the crew&apos;s average labor
            rate, and the row says so (&quot;hours × crew avg rate&quot;). &quot;No labor rate
            configured&quot; means no rate is set up for the crew, so cost shows as $0 rather than a
            guess. Add labor rates to see it.
          </li>
          <li>
            <strong>Labor Hours vs. Schedule</strong> — appears when the hours on the job&apos;s
            visits (what the Dispatch Board shows) differ from the estimate, for example an estimate
            of 20 hours that was later scheduled as 18. You see both numbers and the variance against
            each.
          </li>
          <li>
            <strong>Jobs with no estimate</strong> (recurring and one-time jobs created directly) use
            the worked visits&apos; own budget and revenue as the comparison, and the summary card
            reads &quot;from worked visits&quot;.
          </li>
        </ul>
        <p>
          The revenue card on the Overview also summarizes visits: completed out of total with a
          progress bar, counts for in progress, upcoming, overdue, skipped and cancelled, and the next
          and last-done dates. Click it to open the Visits tab.
        </p>
              <p>
          On a stop worked by two crews, revenue is counted once (on the lead crew&apos;s visit) while the job&apos;s hours and labor cost add up both crews, and the budgeted hours are split evenly between them.
        </p>
      </Section>

      <Section id="jobs-list" title="Finding jobs on the Jobs list">
        <p>
          The Jobs list has three tabs — <strong>Active</strong>, <strong>Unscheduled</strong>, and{" "}
          <strong>Completed</strong>. The Active tab&apos;s <strong>From / To</strong> date range
          applies to every job, keyed on the job&apos;s next pending visit: a job whose next visit
          falls outside the window isn&apos;t listed, <em>including</em> overdue jobs whose next
          visit is already in the past. The filter means exactly what it shows.
        </p>
        <p>
          <strong>The Status column.</strong> A job with visits still to do shows its next
          visit&apos;s status. A job whose visits are all finished shows <strong>Completed</strong>{" "}
          — and lands on the Completed tab — only when at least one visit was actually completed.
          A job whose every visit was skipped or cancelled was never done, so it shows{" "}
          <strong>Needs Attention</strong> on the Active tab instead: reschedule it, or cancel the
          job. A cancelled or on-hold job always shows <strong>Cancelled</strong> or{" "}
          <strong>On Hold</strong>, whatever its visits say.
        </p>
        <Callout>
          To see overdue work, widen <strong>From</strong> back past the oldest date you care about.
          Earlier versions let overdue jobs bypass the window, which made the default 30-day range
          look broken (March jobs showing up under a September window) — that carve-out is gone.
        </Callout>
      </Section>

      <Section id="job-vs-visit-status" title="Job status vs. visit status">
        <p>
          These are two separate state machines, tracked at two different levels, and it&apos;s easy to
          conflate them:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Job status</strong> — one value on the job itself:{" "}
            <code>scheduled</code>, <code>in_progress</code>, <code>completed</code>,{" "}
            <code>cancelled</code>, <code>skipped</code>, or <code>hold</code>. This reflects the
            job as a whole — is it still active, done, or paused.
          </li>
          <li>
            <strong>Visit status</strong> — every individual scheduled occurrence of a job (each time a
            crew is sent out) has its own status:{" "}
            <code>scheduled</code>, <code>dispatched</code>, <code>in_progress</code>,{" "}
            <code>completed</code>, <code>cancelled</code>, or <code>skipped</code>. A recurring job
            with a season&apos;s worth of visits has one row per visit, each cycling through this list
            independently.
          </li>
        </ul>
        <Callout>
          <strong>Worked example.</strong> A recurring mowing job runs weekly, April through October —
          28 visits. The <em>job</em> is created once with status <code>scheduled</code>, flips to{" "}
          <code>in_progress</code> after the first visit goes out, and stays{" "}
          <code>in_progress</code> for the whole season — it doesn&apos;t become
          &quot;completed&quot; until the last visit is done or the job is closed out. Meanwhile{" "}
          <em>visit #14</em>, say, moves on its own from <code>scheduled</code> →{" "}
          <code>dispatched</code> (crew assigned) → <code>in_progress</code> (crew on site) →{" "}
          <code>completed</code>, while visit #15 next week is still sitting at{" "}
          <code>scheduled</code>. A single skipped or cancelled visit doesn&apos;t change the
          job&apos;s status — the job only reflects its own state, not a rollup of every visit.
        </Callout>
        <p>
          <strong>Cancelling a job asks first.</strong> Cancel Job on the job&apos;s header opens a
          confirmation (&quot;Cancel this job?&quot;) so it can&apos;t be clicked by accident. To undo a
          cancellation, set the status back from Cancelled in the job&apos;s edit view.
        </p>
        <p>
          <strong>Changing a service after the job exists.</strong> On the job&apos;s Services tab,
          the pencil edits a service&apos;s Budgeted Hrs (total for the crew), Crew size, quantity and
          rate. Changing Crew keeps the total hours and shows the new per-person figure
          (&quot;= 0.5h per person&quot;); the read-only row shows the total with &quot;3 crew · 0.5h
          each&quot; underneath. The same Men × Hrs:Min calculator is available here.
        </p>
        <p>
          <strong>Completing a recurring or package job ends it.</strong> Setting its status to
          Completed in Job Settings works like cancelling: you&apos;re asked{" "}
          <strong>&quot;Remove the N upcoming visits?&quot;</strong>, and those that haven&apos;t been
          started or invoiced are removed (started, completed and invoiced visits stay); no new
          visits are generated. Saying no leaves the job unchanged. A job completed through the API
          or Zapier removes them the same way, without asking. Setting it back to an active status
          regenerates its upcoming visits.
        </p>
        <p>
          A job in the <code>hold</code> job status pauses future scheduling on that job without
          cancelling it outright — the CRM Client record itself has a related but separate{" "}
          <code>on_hold</code> value in its own status field, which is about the client relationship,
          not any one job.
        </p>
      </Section>

      <Section id="equipment" title="Equipment to bring">
        <p>
          Open a job (from the Jobs list, or from a visit on the Dispatch Board) and scroll to{" "}
          <strong>Equipment to bring</strong> to list what the crew needs on this job — the truck,
          the trailer, the mower, an aerator. Click <strong>Add equipment…</strong> and search by
          name, asset tag, type, make, or model; results are grouped as trucks and vehicles, trailers,
          and other equipment, with each item&apos;s photo. The list stays open so you can add several
          items in a row, and the × on a chip removes one.
        </p>
        <p>
          The items come straight from Equipt — vehicles from the Vehicles registry and everything else
          from Assets — so the truck a crew is told to bring is the same record maintenance tracks.
          Retired (disposed or sold) equipment isn&apos;t offered.
        </p>
        <Callout>
          The list rolls up on the Dispatch Board&apos;s <strong>Crew Board</strong>: if a crew is
          running jobs that need equipment that isn&apos;t loaded on it for the day, the board flags it
          and lets you load it in one click.
        </Callout>
      </Section>

      <Section id="packages" title="Packages, in detail">
        <p>
          CRM &gt; Settings &gt; Packages bundles a set of recurring services under one named program —
          e.g. a &quot;7-Step Fertilizer&quot; plan. A package has a name, an internal code, a
          description, client-facing wording for how it appears on an estimate, separate wording for
          how its visits appear on invoices, and a <code>visits_per_season</code> count. The invoice
          wording is copied onto each package job you create and is what the visit&apos;s invoice line says;
          the estimate wording is the client-facing text for the package when you add it to an estimate (a
          visit&apos;s own invoice description still wins over it on invoices).
        </p>
        <p>
          The package&apos;s <strong>Services tab</strong> is where each visit in the program is
          defined, one row per visit. Per visit you set:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Which service it uses (e.g. &quot;Fert Application 1&quot;), and an optional display name distinct from the service (e.g. &quot;Visit 1&quot;)</li>
          <li>A date window (start/end) the visit should land inside</li>
          <li>Minimum days (<strong>Min Days</strong>) that must elapse between it and the step before it in the sequence</li>
          <li>Default budgeted hours and a default rate, used to seed the job once a client signs up</li>
          <li>
            <strong>Visits Included</strong> — how many visits the step is. A step with 3 becomes 3
            separate visits on the job, each billed at the step&apos;s rate. They are spaced Min Days
            apart when the step sets Min Days, otherwise evenly across the step&apos;s date window
            (or a week apart when it has no end date).
          </li>
        </ul>
        <Callout>
          <strong>Worked example — &quot;Gold Maintenance,&quot; three bundled services.</strong> The
          template defines three rows on the Services tab: Mowing (Visits Included 26, Min Days 7,
          so 26 weekly visits), Spring Cleanup (one visit, dated window in March–April), and Fall
          Cleanup (one visit, dated window in October–November) — each with its own default budgeted
          hours and rate. None of that is a dollar amount a client is billed; it&apos;s a cadence and
          cost template. Only once a client actually signs up does a real <code>package</code>-type job
          get created from the template, and <em>that job</em> — not the package — is where the fixed
          monthly billing amount, any discount, and its renewal (see below) actually live. Two different clients
          signed up to the same &quot;Gold Maintenance&quot; package can end up on different monthly
          amounts; the package template only guarantees they get the same services on the same
          cadence.
        </Callout>
        <p>
          <strong>Packages on estimates.</strong> On an estimate, <strong>Add Package</strong> puts a
          package&apos;s services on the line-item grid, one line per package service, under a section
          header named after the package. Each line keeps the package&apos;s visit count and its
          per-visit price. When the client accepts, <strong>Convert to Job</strong> creates a real
          Package job from those lines: the package, its total steps, each step&apos;s date window with
          the Min Days spacing, the package&apos;s invoice description, and one visit per dated step.
          The convert window&apos;s <strong>Scheduled Date</strong> becomes a Program Start Date that
          moves every step window by the same number of days. Convert one package at a time, and not
          together with ordinary lines. A package service with more than one included visit becomes
          that many steps on the job, one visit each, each billed at the per-visit share of the
          line. Convert refuses a line that no longer matches a step of the package (the package
          was edited after the estimate was built), since that visit would never be scheduled or
          billed. An estimate whose package was later deleted still converts against the
          package&apos;s steps.
        </p>
        <p>
          Until a package job&apos;s recurring dates are actually set, it behaves like a Waiting List
          job — no fixed date, only a range — and surfaces on the Waiting List page the same way.
          Each step also has a placeholder visit (created at signup so the step has a date and crew),
          but a step that hasn&apos;t been dispatched yet is <em>only</em> on the Waiting List — it
          doesn&apos;t show on the Dispatch Board, Crew Board or calendar. Nothing dispatches a package
          step automatically: click <strong>Dispatch</strong> on the step on the Waiting List (or use
          Nearby Waiting List on the board), and it moves to the Dispatch Board on the day and crew you
          choose.
          A dispatched step that didn&apos;t happen (rained out, say) can go back: select it on the
          Dispatch Board and choose <strong>Return to Waiting List</strong>. Its visit becomes the
          step&apos;s undispatched placeholder again and the step is listed on the Waiting List,
          where Dispatch defaults to the placeholder&apos;s date (or today, if that has passed).
          Later steps are re-spaced when it is completed. Deleting a step&apos;s visit (the client
          opted out of that application) is permanent — the step isn&apos;t re-created.
        </p>
        <Callout>
          <strong>Min Days is enforced, not just suggested.</strong> Once a package job&apos;s visits
          exist, any manual reschedule — Move to Day, dragging on the Dispatch Board, editing the date
          on the job, or a bulk move — is checked against the spacing rules. Moving Step 2 to within 14
          days of Step 1 on a program that requires 14 is refused with a message like{" "}
          <em>&quot;Step 2 must be at least 14 days after Step 1 (earliest 5/15)&quot;</em>, and the
          visit stays where it was. Moving an earlier step so that a <em>later</em> step ends up too
          close is blocked the same way, with the message telling you which step to move first. Steps
          with no Min Days set can be moved freely. When the spacing doesn&apos;t apply (the client asked
          for an early visit, say), the move, the Waiting List dispatch and Nearby Waiting List each
          ask you to confirm instead — <strong>Move anyway</strong> / <strong>Dispatch anyway</strong> —
          and then go ahead. Anyone who can schedule visits can confirm.
        </Callout>
        <p>
          The <strong>Package Summary Report</strong> tracks progress per package job by counting{" "}
          <em>visits</em>, not jobs: Total Visits is every visit on the job (cancelled ones
          included), Completed and Cancelled are counted by visit status, and Remaining is Total −
          Completed − Cancelled — so a cancelled visit reduces what is left to deliver rather than
          sitting in Remaining forever. Earned revenue is completed visits × the per-visit amount;
          Pending is the job total minus Earned, which means a package job with no visits generated
          yet shows as entirely Pending.
        </p>
      </Section>

      <Section id="package-renewal" title="Renewing a package for next season">
        <p>
          A package job covers one season. When the client signs up again, <strong>Renew for next
          season</strong> creates next season&apos;s job from last season&apos;s instead of building it
          again with Add Job. Open the package job, click <strong>More (…)</strong>, and choose{" "}
          <strong>Renew for next season</strong>. The window shows the season it renews from and to,
          every step with its new date and rate, and the program total. Click <strong>Renew for
          (year)</strong> and the new job opens.
        </p>
        <p>
          The new job is for the same client and property, with the same package, services, rates,
          quantities, budgets, team size, Min Days and taxable setting, the same crew and sales rep, and
          the same crew notes, office notes and invoice description, including each service&apos;s own
          crew note, invoice description and internal note. Each service&apos;s crew checklist
          (its sub-items) comes along, and so do planned job materials that were never recorded on a
          visit, and each step visit gets its own pending materials from those sub-items, the same as
          on a new job. By default every step date is last season&apos;s date on <em>this job</em> moved
          forward one year (Feb 29 becomes Feb 28), so anything you changed for this client carries
          over. Tick <strong>Use the package&apos;s current dates</strong> (or <strong>Use each
          package&apos;s current dates</strong> in Renew Packages) to take each step&apos;s window from
          Settings → Packages instead, moved to the new season — it doesn&apos;t matter whether
          you&apos;ve updated the package&apos;s dates for the new year yet. A step with Visits Included
          above 1 is spread over its window the same way Add Job spreads it, so each of its visits gets
          its own date in order. The job&apos;s own steps and
          rates are kept either way: a step the package doesn&apos;t have keeps last season&apos;s date,
          a step the package has but the job doesn&apos;t is not added (the window lists both), and a
          package with no step dates keeps last season&apos;s dates. Min Days spacing is applied in
          both cases. Visits are then created exactly as Add Job creates them for a package, one per
          dated step. The new job&apos;s Sale Type is <strong>Renewal</strong> (for commissions), its
          Date Sold is today, and it fires the <strong>Package renewed</strong> automation trigger —
          not Job created or Package created, so a renewing client doesn&apos;t get your new-customer
          sequence. Build a sequence on Package renewed (optionally for specific packages) for a
          thank-you-for-renewing message. Last season&apos;s job is not changed.
        </p>
        <Callout>
          <strong>Which season it renews into.</strong> Dates move forward as many years as it takes to
          land on a season that hasn&apos;t started yet. A season already under way is used only while
          most of it is still ahead (a late sign-up in spring renews into this season); once it is past
          its midpoint, the renewal goes to next season instead. If some steps still land before today,
          the window (and each Renew Packages row) says how many, so you can move them on the new job.
        </Callout>
        <p>
          <strong>Renewing many at once.</strong> On the Jobs list, click <strong>Renew
          Packages</strong>. Pick the season to renew from and every package job from that season is
          listed with its renewal state. The ones not yet renewed, and not marked Don&apos;t renew, are
          ticked — except cancelled jobs and clients who cancelled or were lost, which are listed but
          left unticked (tick them by hand to renew anyway). Untick any you want to leave out and click <strong>Renew</strong>. Several are renewed
          at once (one client&apos;s jobs in order), the button counts progress, and each row shows the
          new job or why it was skipped. Keep the window open until it finishes — the browser warns you
          if you try to leave mid-run.
        </p>
        <p>
          <strong>What stops a double renewal.</strong> A package job can have only one live renewal —
          renewing it a second time, from anywhere, is refused with the existing renewal&apos;s number.
          If the client already has the same package at the same property for the new season (say it
          was added with Add Job), you are warned and have to tick <strong>Renew anyway</strong>; Renew
          Packages skips those. Deleting the renewal lets the old job be renewed again.
        </p>
        <p>
          <strong>Contracts.</strong> A renewal stays linked to last season&apos;s contract only if that
          contract is still active and covers the whole renewed program, from its first step to its
          last — a contract-linked package is billed inside the contract and gets no invoices of its
          own, so a contract ending mid-season would leave the later steps billed nowhere. Otherwise the window says so and the
          renewal is not linked, which means it bills on its own on the client&apos;s invoice frequency
          — link the renewed contract on the new job if it should bill under one.
        </p>
        <p>
          <strong>Raising prices.</strong> Rates are copied as they were unless you fill in{" "}
          <strong>Raise rates by __ %</strong> (both renew windows) and pick a rounding — exact cent,
          nearest $0.25, $1 or $5. Every step&apos;s rate on the new job goes up by that percent, rounded
          the same way as a Price Adjustment run; a $0 step stays $0. The single-job window shows each
          step&apos;s old and new rate and the new total. Last season&apos;s job is not changed.
        </p>
        <p>
          <strong>Clients who aren&apos;t coming back.</strong> On the job, More (…) →{" "}
          <strong>Mark as not renewing</strong> (or <strong>Don&apos;t renew</strong> on its Renew
          Packages row). Renew Packages leaves it unticked and the report shows it as Don&apos;t renew;{" "}
          <strong>Renew as usual</strong> undoes it. The job header shows <em>Renewal of #…</em> and{" "}
          <em>Renewed as #…</em> links between the seasons.
        </p>
        <p>
          The <strong>Custom Package Renewal Report</strong> (Report Center → Service Reports) lists
          every package job with its season and a Renewal column — Renewed (with the new job&apos;s
          number and season), Not renewed, or Don&apos;t renew. Filter by Season and Renewal for a
          renewal to-do list.
        </p>
      </Section>

      <Section id="projects" title="Projects (Landscapt vs. Equipt/PO)">
        <p>
          CRM &gt; Scheduling &gt; Projects tracks one-off landscaping jobs — a patio install, a large
          cleanup — separately from recurring service, for job-level cost tracking and reporting. This
          is the same <code>project</code> job type described in the table above.
        </p>
        <Callout>
          <strong>Same name, different table.</strong> The Equipt/PO module also has a
          &quot;Projects&quot; concept — the cost-tracking bucket that Purchase Order line items
          (categories <code>project_material</code> and <code>stocked_material</code>) get assigned to
          for procurement-side reporting. These are related in spirit — both exist to answer &quot;what
          did this job cost&quot; — but they are not the same table, the same record, or automatically
          linked. A Landscapt <code>project</code> job and an Equipt/PO project are two separate things
          that happen to share a name.
        </Callout>
      </Section>

      <Section id="recurring-setup" title="Setting up a recurring job, step by step">
        <p>
          &quot;Recurring schedule&quot; can mean two different things. For recurring{" "}
          <em>client service</em> (weekly mowing, bi-weekly maintenance) in Landscapt, follow these steps.
          For recurring <em>equipment maintenance</em> in Equipt, see the Preventive Maintenance
          Schedules guide instead (CMMS &gt; PM Schedules).
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Create the schedule template (once).</strong> In the sidebar, under{" "}
            <strong>Administration</strong>, click <strong>Schedules</strong>, then{" "}
            <strong>Add Schedule</strong>. Give it a name, a frequency, a day of the week and, if the
            service is seasonal, a season window. Skip this step if the schedule you need already
            exists. If the Schedule dropdown on the job is a plain text box, no schedules exist yet.
          </li>
          <li>
            <strong>Add the job.</strong> Go to <strong>Jobs → Add Job</strong>, pick the client, and set
            the Job Type to <strong>Recurring</strong>.
          </li>
          <li>
            <strong>Fill in the recurring fields.</strong> Choose the service, pick your template in the{" "}
            <strong>Schedule</strong> dropdown, set <strong>Start Recurring</strong>, and optionally an{" "}
            <strong>End Date</strong>. With no End Date, visits are generated through the end of the year.
          </li>
          <li>
            <strong>Check the preview, then save.</strong> The <strong>Upcoming Dates</strong> panel shows
            the dates the schedule will produce. When you save, the visits are created automatically and
            appear on the Dispatch Board (CRM &gt; Scheduling &gt; Dispatch Board).
          </li>
        </ol>
        <p>
          To drop a single date, such as a holiday, use <strong>Skip Dates</strong>, described below.
        </p>
      </Section>

      <Section id="schedule-templates" title="Schedule templates">
        <p>
          The <strong>Schedule</strong> dropdown on a recurring job is fed by the{" "}
          <strong>Schedules</strong> page: in the Landscapt sidebar, under <strong>Administration</strong>,
          click <strong>Schedules</strong> (CRM &gt; Schedules). It is its own sidebar item, not a tab
          inside the Settings page, so look for it in the sidebar list. Click{" "}
          <strong>Add Schedule</strong> to create one. Each schedule is a reusable pattern: a name, a
          frequency (Weekly, Bi-Weekly, Every 3 or 4 Weeks, Monthly, or Custom dates), a day of the
          week, and an optional season window. The <strong>Upcoming Dates</strong> panel in the
          dialog previews the dates it will produce, and those are the same dates the visit
          generator uses. Managing schedules needs the <strong>Scheduling Settings</strong> permission
          (admins always have it); without it the Schedules page and sidebar item are hidden, and
          schedules can&apos;t be edited, switched off or deleted. Anyone who can add jobs can still
          create a new schedule from a job&apos;s <strong>Recurring Schedule</strong> picker.
        </p>
        <p>
          <strong>Every-other-week, every-3-weeks and every-4-weeks schedules run per job.</strong>{" "}
          Unless a bi-weekly schedule is set to Even or Odd weeks with an anchor, each job on one of
          these schedules counts its own cycle from its <strong>Start Recurring</strong> date — two
          jobs on &ldquo;Every 3 Weeks Tuesday&rdquo; can land on different Tuesdays. The Upcoming
          Dates preview then shows one <em>example</em> cycle and says so.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Skip Dates.</strong> To drop a single date from a recurring schedule — say a
            holiday Monday on a weekly Monday run — use the <strong>Skip Dates</strong> calendar in
            the dialog. Dates the schedule lands on show in green; click one to skip it (it turns
            red and struck through) and click again to restore it. On a per-job schedule
            (every other week, every 3 or 4 weeks) every in-season day on the schedule&apos;s weekday
            can be skipped: the example cycle&apos;s dates are filled in green and the other weeks are
            outlined, because some job on the schedule may land on them. Skipped dates are left out
            of the preview and out of newly generated visits. Visits already created for a date you
            later skip are removed only if you choose to update visits when you save (see below);
            otherwise cancel those on the Dispatch Board.
          </li>
          <li>
            <strong>Custom dates.</strong> Choose the <strong>Custom dates</strong> frequency to pick
            the exact service dates from a month calendar — click a day to add it, click it again to
            remove it, and use the arrows to move between months. Custom schedules ignore the day of
            week and season window, and need at least one date.
          </li>
          <li>
            <strong>Season window.</strong> Season Start and Season End each have a{" "}
            <strong>Clear</strong> link, so you can go back to year-round after setting one.
          </li>
          <li>
            <strong>Rescheduling existing visits.</strong> After you save a change to a
            schedule&apos;s day, frequency, week pattern, season, custom dates or skip dates
            (holidays), the app compares each job&apos;s upcoming visits with the new rules. Visits on
            dates the new rules still include are kept exactly as they are — crew, time, notes,
            priority and multi-crew setup included. If some visits fall on dates the new rules drop,
            you&apos;re asked <strong>&quot;Remove N upcoming visits the new schedule
            drops?&quot;</strong> <strong>Update visits</strong> removes those (only untouched ones:
            scheduled, not dispatched, not clocked in, not invoiced and not dragged to another day by
            hand) and adds visits for the new dates. If nothing needs removing, the new dates are
            simply added. In-progress, completed, dispatched and hand-moved visits are never removed.
            Choose <strong>Keep existing visits</strong> to leave every visit already on the calendar
            where it is: each job on the schedule then generates new-schedule visits only{" "}
            <em>after</em> its last existing visit, so no week ends up with a visit on the old day and
            another on the new one. The job&apos;s Job Settings shows the date as{" "}
            <strong>New visits after</strong>; a later schedule update that replaces visits (or
            changing that job&apos;s schedule or start date) clears it. Editing one job&apos;s
            schedule, start date or end date on its Job Detail works like Update visits.
          </li>
          <li>
            <strong>Names are unique, and Active means active.</strong> Two live schedules can&apos;t
            share a name (case doesn&apos;t matter) — creating, renaming or importing one that
            clashes is refused with a message, and a duplicate row in a CSV import is skipped.
            Switching a schedule off stops any new visits being generated for the jobs on it
            (including the per-job Generate Visits button); visits that already exist are kept. Renaming a schedule carries every job on it
            along, so they keep their cadence. A schedule that active jobs still use can&apos;t be
            deleted: the Delete dialog shows how many jobs use it — move them to another schedule
            first, or switch the schedule off instead.
          </li>
          <li>
            <strong>Removing one weekday&apos;s visits.</strong> On a job&apos;s Visits tab,{" "}
            <strong>Remove day…</strong> removes that job&apos;s upcoming (today onward) visits on one
            weekday that haven&apos;t been dispatched or started. It doesn&apos;t change the schedule:
            if the job&apos;s schedule still includes that weekday, new visits on it come back as the
            schedule rolls forward, so change the job&apos;s schedule to stop them for good.
          </li>
        </ul>
      </Section>

      <Section id="see-also" title="See also">
        <ul className="list-disc space-y-2 pl-5">
          <li>Dispatch Board — the daily scheduling view (list and calendar) where visits get assigned to crews, plus the Crew Board for crew, equipment, and job assignments</li>
          <li>Waiting List — the opportunistic-dispatch queue for <code>waiting_list</code> jobs (and unscheduled <code>package</code> jobs)</li>
          <li>Snow Jobs — storm-based scheduling for the <code>snow</code> job type</li>
        </ul>
      </Section>
      <Section id="good-to-know" title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Complete waits for open visits.</strong> A job is marked Completed only when nothing is left open on it. The job&apos;s <strong>Complete</strong> button (and setting the status to Completed in Edit Job) refuses while the job still has any visit that isn&apos;t completed, skipped or cancelled, and says how many. Complete, skip or cancel them on the Visits tab first; each completed visit invoices itself, so the job isn&apos;t billed for work not done or billed twice. Once nothing is open, any job type — one-time, waiting list, snow or project — can be marked Completed, and the confirmation tells you the status it was actually given.
          </li>
          <li>
            <strong>Scheduling a job&apos;s visits needs a scheduling permission.</strong> On the Visits tab, Schedule Visit, Generate Visits, Remove day, and each visit&apos;s dispatch / change date or crew, skip and delete actions — and the job&apos;s Complete button — appear only for roles with Dispatch Board, Waiting List, Manage Snow Dispatch or Add Job (a project job also accepts Add/Modify Projects). A role with only View Jobs can read the job and add notes. See <strong>Users &amp; Roles</strong>.
          </li>
          <li>
            <strong>Where the Invoice button appears.</strong> Job Detail&apos;s <strong>Invoice</strong> button is for one-time and waiting-list jobs. Recurring and package jobs invoice visit by visit, snow jobs bill through Snow Invoicing, and project jobs bill through their milestones, so the button isn&apos;t shown on those.
          </li>
          <li>
            <strong>Inactive and lost clients get no new visits.</strong> Recurring and package visits stop being generated for a client marked Inactive, Lost or Cancelled (and for deleted clients). Reactivating the client resumes generation on the next run.
          </li>
          <li>
            <strong>Visits the crew is working are locked.</strong> While a crew is clocked in to a visit you can&apos;t move, re-crew, cancel, skip or delete it. A visit the crew skipped after starting can be rescheduled or reopened.
          </li>
          <li>
            <strong>Note All Visits.</strong> Save to All adds the note to every scheduled visit and tells you if any couldn&apos;t be updated.
          </li>
          <li>
            <strong>Escape closes the job panel safely.</strong> Pressing Escape inside a dialog on the job (a confirmation, Send Email) closes only that dialog, not the whole job panel.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
