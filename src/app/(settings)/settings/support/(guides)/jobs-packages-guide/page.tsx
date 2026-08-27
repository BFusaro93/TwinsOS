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
  ["Recurring", "A repeating service on a schedule — mowing every week, fertilizer every 5 weeks. Generates a visit for each occurrence.", "Convert Estimate to Job"],
  ["One Time", "A single visit, no recurrence.", "Convert Estimate to Job"],
  ["Project", "A one-off landscaping job tracked separately from recurring service — the Landscapt equivalent of a cost-tracking bucket, for a job like a patio install or a large cleanup.", "Convert Estimate to Job"],
  ["Waiting List", "No fixed date — only a date range. Surfaces on the Waiting List page for opportunistic dispatch when a crew is nearby.", "Convert Estimate to Job"],
  ["Package", "A bundled recurring service program (e.g. a 7-Step Fertilizer plan) billed as one fixed monthly amount.", "Created directly, not converted from an estimate"],
  ["Snow", "Storm-based scheduling and service entry — snow/ice events rather than calendar dates.", "Created directly, not converted from an estimate"],
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
        <p>Two paths onto the schedule, depending on the type:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Convert Estimate to Job</strong> — from a won estimate, pick a Job Type of{" "}
            <strong>One Time</strong>, <strong>Recurring</strong>, <strong>Project</strong>, or{" "}
            <strong>Waiting List</strong>. The estimate&apos;s services, quantities, and pricing carry
            over onto the job.
          </li>
          <li>
            <strong>Created directly</strong> — <strong>Package</strong> and <strong>Snow</strong> jobs
            aren&apos;t converted from an estimate. A Package job is created when a client signs up for
            a package program (see below); a Snow job is created directly against a storm/service
            event.
          </li>
        </ul>
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
          <li>Minimum days that must elapse before/between it and adjacent visits in the sequence</li>
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
