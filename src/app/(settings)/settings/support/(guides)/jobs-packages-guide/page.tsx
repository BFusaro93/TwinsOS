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
  ["Package", "A bundled recurring service program (e.g. a 7-Step Fertilizer plan) billed as one fixed monthly amount.", "Jobs → Add Job only — not converted from an estimate"],
  ["Snow", "Storm-based scheduling and service entry — snow/ice events rather than calendar dates.", "Jobs → Add Job only — not converted from an estimate"],
];

export default function JobsPackagesGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Jobs & Packages"
        description="The six job types, how a job's status differs from a visit's status, and how a Package template turns into a billed job."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#job-types">The six job types</TOCLink>
          <TOCLink href="#creating-jobs">Creating a job</TOCLink>
          <TOCLink href="#job-value">Where a job&apos;s value comes from</TOCLink>
          <TOCLink href="#jobs-list">Finding jobs on the Jobs list</TOCLink>
          <TOCLink href="#job-vs-visit-status">Job status vs. visit status</TOCLink>
          <TOCLink href="#packages">Packages, in detail</TOCLink>
          <TOCLink href="#projects">Projects (Landscapt vs. Equipt/PO)</TOCLink>
          <TOCLink href="#see-also">See also</TOCLink>
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
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{created}</td>
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
            This is the <em>only</em> way to create a <strong>Package</strong> or{" "}
            <strong>Snow</strong> job.
          </li>
        </ul>
        <p>
          The <strong>client picker</strong> in Add Job is searchable — type part of a name or an
          account number to find the account. Only clients appear in it:
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
            run; a job whose End Date has already passed generates nothing.
          </li>
          <li>
            <strong>Package</strong> — pick the package program and a Start Date. Each step&apos;s date
            window and rate are seeded from the package template (rates default from the package or
            the service&apos;s own pricing). <strong>Changing the Start Date shifts every step window
            by the same number of days</strong>, so a program that starts two weeks late re-anchors
            as a whole instead of leaving its steps on the template dates. The dialog shows the
            billing summary as <strong>Monthly $X · Total $Y</strong> — the total is the sum of the
            step rates, spread evenly over the months the program covers.
          </li>
          <li>
            <strong>Snow</strong> — service, days authorized, inch trigger, invoice type, and rate.
            Picking a service fills in its default rate only while the rate is still blank; a rate
            you&apos;ve already typed is never overwritten by choosing a service afterward.
          </li>
          <li>
            <strong>One Time</strong>, <strong>Project</strong>, <strong>Waiting List</strong> — a
            service line (or several), date or date range, crew, and team size.
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
      </Section>

      <Section id="jobs-list" title="Finding jobs on the Jobs list">
        <p>
          The Jobs list has three tabs — <strong>Active</strong>, <strong>Unscheduled</strong>, and{" "}
          <strong>Completed</strong>. The Active tab&apos;s <strong>From / To</strong> date range
          applies to every job, keyed on the job&apos;s next pending visit: a job whose next visit
          falls outside the window isn&apos;t listed, <em>including</em> overdue jobs whose next
          visit is already in the past. The filter means exactly what it shows.
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
          A job in the <code>hold</code> job status pauses future scheduling on that job without
          cancelling it outright — the CRM Client record itself has a related but separate{" "}
          <code>on_hold</code> value in its own status field, which is about the client relationship,
          not any one job.
        </p>
      </Section>

      <Section id="packages" title="Packages, in detail">
        <p>
          CRM &gt; Settings &gt; Packages bundles a set of recurring services under one named program —
          e.g. a &quot;7-Step Fertilizer&quot; plan. A package has a name, an internal code, a
          description, client-facing wording for how it appears on an estimate, separate wording for
          how its visits appear on invoices, and a <code>visits_per_season</code> count.
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
        </ul>
        <Callout>
          <strong>Worked example — &quot;Gold Maintenance,&quot; three bundled services.</strong> The
          template defines three rows on the Services tab: Mowing (visits_included high, weekly
          cadence via min-days), Spring Cleanup (one visit, dated window in March–April), and Fall
          Cleanup (one visit, dated window in October–November) — each with its own default budgeted
          hours and rate. None of that is a dollar amount a client is billed; it&apos;s a cadence and
          cost template. Only once a client actually signs up does a real <code>package</code>-type job
          get created from the template, and <em>that job</em> — not the package — is where the fixed
          monthly billing amount, any discount, and renewal terms actually live. Two different clients
          signed up to the same &quot;Gold Maintenance&quot; package can end up on different monthly
          amounts; the package template only guarantees they get the same services on the same
          cadence.
        </Callout>
        <p>
          Until a package job&apos;s recurring dates are actually set, it behaves like a Waiting List
          job — no fixed date, only a range — and surfaces on the Waiting List page the same way.
        </p>
        <Callout>
          <strong>Min Days is enforced, not just suggested.</strong> Once a package job&apos;s visits
          exist, any manual reschedule — Move to Day, dragging on the Dispatch Board, editing the date
          on the job, or a bulk move — is checked against the spacing rules. Moving Step 2 to within 14
          days of Step 1 on a program that requires 14 is refused with a message like{" "}
          <em>&quot;Step 2 must be at least 14 days after Step 1 (earliest 5/15)&quot;</em>, and the
          visit stays where it was. Moving an earlier step so that a <em>later</em> step ends up too
          close is blocked the same way, with the message telling you which step to move first. Steps
          with no Min Days set can be moved freely.
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

      <Section id="see-also" title="See also">
        <ul className="list-disc space-y-2 pl-5">
          <li>Dispatch Board — the daily scheduling view where visits get assigned to crews</li>
          <li>Waiting List — the opportunistic-dispatch queue for <code>waiting_list</code> jobs (and unscheduled <code>package</code> jobs)</li>
          <li>Snow Jobs — storm-based scheduling for the <code>snow</code> job type</li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
