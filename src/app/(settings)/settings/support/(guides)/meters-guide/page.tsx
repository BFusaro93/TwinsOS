import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const TRIGGER_TYPES: [string, string][] = [
  ["Meter Threshold", "A meter's current value crosses a number you choose (see below for the full walkthrough)."],
  ["Part Low Stock", "A part's quantity on hand drops to or below its minimum stock level — any part, or one you specify."],
  ["PM Schedule Due", "A preventive-maintenance schedule's next-due date is within N days."],
  ["Work Order Overdue", "A work order's due date has passed by N or more days."],
  ["New Maintenance Request", "A new maintenance request is submitted."],
  ["Work Order Status Changed", "A work order's status changes to a specific value you pick."],
  ["Purchase Order Status Changed", "A purchase order's status changes to a specific value you pick."],
];

const ACTION_TYPES: [string, string][] = [
  ["Create Work Order", "Opens a work order directly. Supports a Service Interval (see below)."],
  ["Create Maintenance Request", "Adds a review step before it becomes a work order. Also supports a Service Interval."],
  ["Create Purchase Requisition", "Starts a requisition — useful for parts or consumables tied to the trigger."],
  ["Send Notification", "Notifies a role in-app."],
  ["Send Email", "Emails a role or address. Requires email configured in Settings first."],
];

const TEMPLATES: [string, string][] = [
  ["Low Stock Alert", "Fires on Part Low Stock; creates a requisition automatically."],
  ["PM Due Reminder", "Fires on PM Schedule Due; creates a work order ahead of the due date."],
  ["WO Completed — Notify Team", "Fires on Work Order Status Changed (Done); sends a notification."],
  ["PO Approved", "Fires on Purchase Order Status Changed (Approved); sends a notification."],
];

export default function MetersGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Equipt (CMMS)"
        title="Meters & Usage-Based Automations"
        description="Track hours, miles, gallons, and cycles on any asset — and let Equipt open the work order for you the moment a threshold is crossed."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#what-are-meters">What are meters</TOCLink>
          <TOCLink href="#adding-and-reading">Adding a meter and recording readings</TOCLink>
          <TOCLink href="#building-an-automation">Building a meter-threshold automation</TOCLink>
          <TOCLink href="#worked-example">Worked example: Truck #4 oil changes</TOCLink>
          <TOCLink href="#pending-reset">Pending Reset, explained</TOCLink>
          <TOCLink href="#trigger-action-reference">Trigger &amp; action reference</TOCLink>
          <TOCLink href="#templates">Pre-built templates</TOCLink>
          <TOCLink href="#related">PM Schedules, Zapier, and Samsara</TOCLink>
        </div>
      </div>

      <Section id="what-are-meters" title="What are meters">
        <p>
          A meter tracks a usage value that accrues over time on a specific asset or vehicle —
          engine hours on a mower, odometer miles on a truck, gallons through a sprayer, cycles on
          a piece of equipment. Unlike a PM schedule, which fires on a calendar date, a meter fires
          based on <em>how much the asset has actually been used</em>.
        </p>
        <p>
          Meters exist to feed one thing: usage-based automations. Once a meter is recording
          readings, you can wire up an automation in CMMS &gt; Automations that watches it and
          reacts the moment it crosses a threshold you set.
        </p>
      </Section>

      <Section id="adding-and-reading" title="Adding a meter and recording readings">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open any asset or vehicle detail and go to the <strong>Meters</strong> tab. Click{" "}
            <strong>+ New Meter</strong>.
          </li>
          <li>
            Choose the unit — miles, hours, gallons, cycles, or whatever fits the asset — and give
            the meter a name (e.g. &quot;Odometer&quot; or &quot;Engine Hours&quot;).
          </li>
          <li>
            To log usage, click the meter and use <strong>+ Add Reading</strong>. Enter the value
            and the date.
          </li>
          <li>
            The meter&apos;s current value always reflects the latest reading — there&apos;s no
            separate &quot;current value&quot; field to keep in sync manually.
          </li>
        </ol>
        <Callout>
          Every reading you add — manual or synced — runs the automations engine instantly in the
          background. If the new value crosses a threshold on an enabled automation, the resulting
          work order or request is created right away, not on the next poll or batch job.
        </Callout>
      </Section>

      <Section id="building-an-automation" title="Building a meter-threshold automation">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to <strong>CMMS &gt; Automations</strong> and click <strong>+ New Automation</strong>.
          </li>
          <li>
            Set <strong>Trigger Type</strong> to <strong>Meter Threshold</strong>, then select the
            specific meter to watch.
          </li>
          <li>
            Choose the operator — <strong>≥</strong> is the one you&apos;ll use almost always for
            cumulative meters like mileage or hours, since those values only go up. Enter the{" "}
            <strong>threshold value</strong> to compare against.
          </li>
          <li>
            Pick an <strong>action type</strong>. If it&apos;s Create Work Order or Create WO
            Request, you can also set a <strong>Service Interval</strong> — see the worked example
            below for what that does.
          </li>
        </ol>
      </Section>

      <Section id="worked-example" title="Worked example: Truck #4 oil changes">
        <p>
          This is the canonical use of meter automations — a recurring, mileage-based service that
          keeps re-scheduling itself without anyone touching the threshold by hand.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Truck #4 has an <strong>Odometer</strong> meter, currently at 31,200 miles from past
            readings.
          </li>
          <li>
            An automation is configured: Trigger = Meter Threshold, Meter = Truck #4 — Odometer,
            Operator = ≥, Threshold = <strong>36,000</strong>. Action = Create Work Order (&quot;Oil
            Change&quot;), Service Interval = <strong>5,000 miles</strong>.
          </li>
          <li>
            A crew member logs a new odometer reading of 36,150 miles. The automations engine runs
            instantly, sees 36,150 ≥ 36,000, and creates the &quot;Oil Change&quot; work order right
            then.
          </li>
          <li>
            The automation&apos;s <strong>Pending Reset</strong> flag flips to true — see the next
            section for why. No second work order gets created no matter how many more readings
            come in while it&apos;s pending.
          </li>
          <li>
            A tech performs the oil change and marks the work order <strong>Done</strong>. That
            closes the loop: Pending Reset clears, and the threshold automatically advances by the
            5,000-mile interval — from 36,000 to <strong>41,000</strong> miles.
          </li>
          <li>
            Later, another reading pushes the odometer past 41,000. The automation fires again, a
            new Oil Change work order is created, and the cycle repeats — 46,000 next, then 51,000,
            and so on — with no one ever editing the threshold by hand.
          </li>
        </ol>
      </Section>

      <Section id="pending-reset" title="Pending Reset, explained">
        <p>
          Pending Reset is the state that keeps a meter-threshold automation from firing over and
          over. Without it, every single reading that still satisfies the operator (e.g. every
          reading ≥ 36,000 miles, which is <em>all of them</em> once you&apos;ve crossed that line)
          would create another work order.
        </p>
        <p>Think of it as a simple two-state machine:</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Meaning</th>
              <th className="px-3 py-2">What clears it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                Pending Reset = false
              </td>
              <td className="px-3 py-2 text-[#4a4a46]">
                Armed. The automation is watching and will fire the next time a reading crosses the
                threshold.
              </td>
              <td className="px-3 py-2 text-[#4a4a46]">—</td>
            </tr>
            <tr>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                Pending Reset = true
              </td>
              <td className="px-3 py-2 text-[#4a4a46]">
                Already fired once for this threshold. Further readings that still cross it are
                ignored — no duplicate work orders.
              </td>
              <td className="px-3 py-2 text-[#4a4a46]">
                The linked work order (or request) is marked Done. That&apos;s also the moment the
                Service Interval, if set, advances the threshold.
              </td>
            </tr>
          </tbody>
        </Table>
        <Callout>
          <strong>Automation didn&apos;t fire when you expected?</strong> Check, in order: 1) the
          automation is enabled. 2) Pending Reset is false — if it&apos;s stuck true, the linked
          work order likely hasn&apos;t been marked Done yet. 3) the meter&apos;s current value
          actually crosses the threshold. 4) the correct meter is selected in the trigger config.
        </Callout>
      </Section>

      <Section id="trigger-action-reference" title="Trigger & action reference">
        <p>Every trigger type an automation can use, and every action it can take.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Trigger type</th>
              <th className="px-3 py-2">Fires when&hellip;</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {TRIGGER_TYPES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Action type</th>
              <th className="px-3 py-2">What it does</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {ACTION_TYPES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="templates" title="Pre-built templates">
        <p>
          The Automations page also offers ready-made templates — click any template card to add it
          to your org instantly, no manual configuration required.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {TEMPLATES.map(([name, desc]) => (
            <li key={name}>
              <strong>{name}</strong> — {desc}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="related" title="PM Schedules, Zapier, and Samsara">
        <p>
          A few related pieces are easy to conflate with meter automations. They&apos;re deliberately
          separate systems:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>PM Schedules</strong> are calendar-based, not usage-based — they fire on a
            recurring date regardless of how much an asset has actually been used. See{" "}
            <a
              href="/settings/support/pm-schedules-guide"
              className="text-[#60ab45] hover:text-[#4a8a33] hover:underline"
            >
              the PM Schedules guide
            </a>{" "}
            for how those work.
          </li>
          <li>
            <strong>Zapier&apos;s &quot;Meter Threshold&quot; trigger</strong> is a separate,
            per-Zap configuration that lives outside Equipt entirely — it doesn&apos;t use, share,
            or affect the Pending Reset state of any automation configured here. See{" "}
            <a
              href="/settings/support/zapier-guide#meter-threshold"
              className="text-[#60ab45] hover:text-[#4a8a33] hover:underline"
            >
              Meter Threshold, in detail
            </a>{" "}
            in the Zapier guide.
          </li>
          <li>
            <strong>Samsara</strong> (Settings &gt; Integrations, API key) syncs vehicle odometer
            readings automatically once connected, updating the corresponding vehicle meter exactly
            as a manual reading would — which can trigger mileage-based automations the same way.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
