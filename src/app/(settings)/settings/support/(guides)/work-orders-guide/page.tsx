import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const WO_STATUSES: [string, string][] = [
  ["Open", "Newly created, not started."],
  ["In Progress", "Work has started."],
  ["On Hold", "Paused — reachable from Open or In Progress."],
  ["Done", "Complete. A parent work order can't reach Done until every sub-work order is Done or Skipped."],
  ["Skipped", "Sub-work orders only — this asset's portion of the job was intentionally not done."],
];

const REQUEST_STATUSES: [string, string][] = [
  ["Open", "Just submitted."],
  ["In Review", "A manager/admin has picked it up to triage."],
  ["Approved", "Confirmed as real, legitimate work. Only status the Convert button appears on."],
  ["Rejected", "Not going to be actioned. Can be reopened back to Open."],
  ["Converted to WO", "Turned into a Work Order. Terminal — read-only from here."],
];

export default function WorkOrdersGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Equipt (CMMS)"
        title="Work Orders & Maintenance Requests"
        description="How a Work Order actually moves through status, how a Maintenance Request gets triaged into one, and what really happens to parts inventory along the way."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#difference">Work Order vs. Maintenance Request</TOCLink>
          <TOCLink href="#creating-wo">Creating a Work Order</TOCLink>
          <TOCLink href="#wo-status">Work Order status</TOCLink>
          <TOCLink href="#requests">Maintenance Requests</TOCLink>
          <TOCLink href="#converting">Converting a Request to a Work Order</TOCLink>
          <TOCLink href="#pm-schedules">Where PM Schedules fit in</TOCLink>
          <TOCLink href="#labor">Labor tracking</TOCLink>
          <TOCLink href="#parts">Parts, inventory, and the clamp-at-zero behavior</TOCLink>
          <TOCLink href="#requisitions">Requesting parts via a Requisition</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="difference" title="Work Order vs. Maintenance Request">
        <p>
          A <strong>Work Order</strong> is the actual job record — assigned, worked, and tracked for
          labor and parts cost. A <strong>Maintenance Request</strong> is a lighter-weight intake
          form for reporting a problem, meant for triage before it becomes a real Work Order — useful
          when whoever spots the issue shouldn&apos;t (or can&apos;t) create a full Work Order
          themselves. Both live under <strong>CMMS</strong> in the sidebar — <strong>Work
          Orders</strong> and <strong>Requests</strong> respectively.
        </p>
      </Section>

      <Section id="creating-wo" title="Creating a Work Order">
        <p>
          Click <strong>+ New Work Order</strong>. Fields: Title (required), Priority (Low / Medium
          / High / Critical — not &ldquo;Urgent&rdquo;), Type (Reactive / Preventive / unspecified),
          Category (multi-select), Asset or Vehicle, Scheduled Date (hides the work order from lists
          until that date arrives), Assigned To (multi-select), Due Date, Description, and an
          optional Recurrence (Daily / Weekly / Biweekly / Monthly / Quarterly / Yearly — regenerates
          a fresh copy automatically once the current one is marked Done).
        </p>
        <Callout>
          <strong>Selecting more than one Asset/Vehicle creates a parent + sub-work-order
          structure</strong> — one parent Work Order plus one sub-Work Order per asset, each
          carrying its own parts and status. This is the same pattern PM Schedules use when
          generating for a multi-asset schedule.
        </Callout>
      </Section>

      <Section id="wo-status" title="Work Order status">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {WO_STATUSES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Both Done and Skipped can be reopened back to Open with a single click if something was
          closed by mistake.
        </p>
      </Section>

      <Section id="requests" title="Maintenance Requests">
        <p>
          There are two separate ways a request gets created — worth knowing both:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>In-app</strong>, for admins/managers/technicians: CMMS &gt; Requests &gt; + New
            Request — title, priority, optional asset/vehicle, description.
          </li>
          <li>
            <strong>A no-login submission path</strong> — the actual &ldquo;anyone can flag a
            problem&rdquo; story. A branded public form (linked by your org&apos;s own slug) and an
            internal field-repair-request page both feed the same submission handler, requiring no
            CMMS access at all. New submissions email your org&apos;s admins/managers automatically
            (if that notification preference is on).
          </li>
        </ul>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {REQUEST_STATUSES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="converting" title="Converting a Request to a Work Order">
        <p>
          The <strong>Convert to Work Order</strong> button only appears once a request reaches{" "}
          <strong>Approved</strong> — that&apos;s the real triage gate. Converting creates a new
          Work Order (always typed Reactive) carrying over the title, description, priority, and
          asset link, and flips the request to <strong>Converted to WO</strong>, a terminal state
          with a link back to the resulting Work Order.
        </p>
      </Section>

      <Section id="pm-schedules" title="Where PM Schedules fit in">
        <p>
          Recurring maintenance is driven by <strong>PM Schedules</strong> (CMMS &gt; PM Schedules),
          not by Work Orders or Requests directly — see the Preventive Maintenance Schedules guide
          for the full mechanics. In short: generating work orders from a schedule is a manual button
          click by default, but an Automations rule can make it fire automatically ahead of the due
          date without anyone clicking anything.
        </p>
      </Section>

      <Section id="labor" title="Labor tracking">
        <p>
          A Work Order&apos;s <strong>Costs</strong> tab has a Labor section: technician name (free
          text, not linked to a user account), a description, hours, and an hourly rate — each entry
          rolls up into a running labor total for the work order.
        </p>
      </Section>

      <Section id="parts" title="Parts, inventory, and the clamp-at-zero behavior">
        <p>
          Adding a part to a Work Order&apos;s Costs tab decrements that part&apos;s quantity on hand
          immediately — this is the normal, expected way stock goes <em>down</em>, independent of
          (and usually before) any formal receiving. Removing a part restores the quantity; editing
          the quantity applies the difference. Using a part on a Work Order also auto-links it to
          that asset going forward, so it shows up as a &ldquo;commonly used&rdquo; part the next
          time.
        </p>
        <Callout>
          <strong>Using more than you have doesn&apos;t error — it clamps at zero.</strong> If you
          add more of a part to a Work Order than is actually in stock, quantity on hand is set to 0
          instead of going negative, with a toast telling you how many you were short. Nothing blocks
          you from doing this; it&apos;s a warning, not a hard stop.
        </Callout>
      </Section>

      <Section id="requisitions" title="Requesting parts via a Requisition">
        <p>
          A Requisition can be linked back to the Work Order that needed it — but today that link
          only gets created through the public API or a Zapier automation, not from a button inside
          the Work Order screen itself. If you&apos;re creating requisitions by hand from inside a
          Work Order&apos;s detail panel, there&apos;s currently no field to set that connection; the
          underlying data model supports it, the in-app form just doesn&apos;t expose it yet.
        </p>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>A parent Work Order can&apos;t be completed until every sub-work-order is Done
            or Skipped.</strong> If a multi-asset Work Order won&apos;t let you mark it done, check
            for an open sub-work-order first.
          </li>
          <li>
            <strong>Priority is Low / Medium / High / Critical</strong> — if you&apos;re looking for
            an &ldquo;Urgent&rdquo; option, it doesn&apos;t exist; Critical is the top tier.
          </li>
          <li>
            <strong>Work Order, Maintenance Request, and Requisition numbers all use different
            prefixes and digit counts</strong> (<code>WO-</code>, <code>MR-</code>,{" "}
            <code>REQ-</code>) and none of them are strictly sequential — they&apos;re
            timestamp-derived, not gapless counters.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
