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

const CARDS: [string, string][] = [
  ["Uptime", "Share of in-service time the asset was Active, over the window you pick (30 days, 90 days, 12 months). Shows hours down and the number of downtime events — or \"Down since …\" in red while it's in the shop right now."],
  ["Maint. cost · 12 mo", "Parts, labor and vendor charges on this asset's work orders over the last 12 months, split into PM and Repair."],
  ["Maint. cost · lifetime", "The same, all time — shown as a percent of the purchase price. It turns amber at 50%, a common point to start asking repair-or-replace."],
  ["PM compliance", "Scheduled and meter-triggered PMs done ÷ PMs that came due in the window, with the on-time rate underneath."],
  ["Avg repair time", "Mean time to repair: the average length of an In Shop / Out of Service stretch that started and ended in the window. Also shows work orders opened in the window and how many are still open."],
  ["Warranty", "Active, Expiring soon (90 days or less), Expired, or None on file — with a countdown and the end date."],
];

const OUTCOMES: [string, string, string][] = [
  ["On time", "Done on or before its due date", "Done"],
  ["Late", "Done after its due date", "Done"],
  ["Skipped", "Work order marked Skipped", "Missed"],
  ["Overdue", "Still open past its due date", "Missed"],
  ["Not generated", "The schedule's due date passed and no work order was ever generated — or a meter request sat unconverted for more than 7 days", "Missed"],
  ["Pending", "Open and not yet due", "Not counted"],
  ["Paused", "Due inside a pause window", "Not counted (not due at all)"],
];

const STATUSES: [string, string][] = [
  ["Active", "Up — counts toward uptime."],
  ["In Shop", "Down."],
  ["Out of Service", "Down."],
  ["Inactive", "Left out entirely — parked for the season isn't the same as broken, so it's neither up nor down."],
  ["Disposed", "Left out entirely."],
];

export function AssetPerformanceGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Equipt (CMMS)"
        title="Asset Performance, Warranties & Reliability Reports"
        description="Warranty tracking, the performance cards on every asset, and how uptime, maintenance cost and PM compliance are actually calculated."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where">Where to find it</TOCLink>
          <TOCLink href="#warranties">Warranties</TOCLink>
          <TOCLink href="#cards">The performance cards</TOCLink>
          <TOCLink href="#uptime">How uptime is measured</TOCLink>
          <TOCLink href="#costs">How maintenance cost is counted</TOCLink>
          <TOCLink href="#pm-compliance">How PM compliance is scored</TOCLink>
          <TOCLink href="#worked-example">Worked example: a PM generated late</TOCLink>
          <TOCLink href="#reports">The three reports</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="where" title="Where to find it">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>On each asset and vehicle</strong> — the <strong>Performance</strong> cards at the top of
            the Details tab, and a <strong>Warranty</strong> section further down under Purchase Info.
          </li>
          <li>
            <strong>Equipt &gt; Reports</strong> — three tabs: <strong>PM Compliance</strong>,{" "}
            <strong>Uptime</strong> and <strong>Warranties</strong>. Clicking a row opens that asset (or,
            for a missed PM with a work order, that work order).
          </li>
        </ul>
        <p>
          Everything is computed live from your work orders, status changes and PM schedules — there&apos;s
          nothing to refresh or rebuild. Assets and vehicles are treated the same throughout.
        </p>
      </Section>

      <Section id="warranties" title="Warranties">
        <p>
          Open an asset or vehicle, click <strong>Edit</strong>, and fill in the <strong>Warranty</strong>{" "}
          section. You can enter it two ways:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>End date</strong> — type the date coverage ends. A start date is optional.
          </li>
          <li>
            <strong>Coverage period</strong> — enter a length in years or months (e.g. 3 years). Leave the
            start blank to count from the purchase date. The form shows the end date it works out, e.g.
            &quot;Covered through Sep 30, 2026&quot;.
          </li>
        </ul>
        <p>
          A period covers through the day <em>before</em> the anniversary: 12 months from Mar 15, 2026
          covers through Mar 14, 2027. Either way, the end date is what every report reads. Use{" "}
          <strong>Warranty Notes</strong> for the details that don&apos;t fit a date — &quot;powertrain
          5 yr / 2,000 hrs&quot;, &quot;dealer extended plan&quot;, a claim phone number.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">When</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3] dark:border-border"><td className="px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Active</td><td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">More than 90 days left</td></tr>
            <tr className="border-b border-[#eceae3] dark:border-border"><td className="px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Expiring soon</td><td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">90 days or less left — book warranty work before it lapses</td></tr>
            <tr className="border-b border-[#eceae3] dark:border-border"><td className="px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Expired</td><td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">End date has passed</td></tr>
            <tr><td className="px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">None on file</td><td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">No end date entered</td></tr>
          </tbody>
        </Table>
        <Callout>
          <strong>Duplicating an asset doesn&apos;t copy its warranty.</strong> A copy is a different
          machine with its own purchase, so the warranty section starts blank — same as serial number and
          purchase price.
        </Callout>
      </Section>

      <Section id="cards" title="The performance cards">
        <p>
          The window toggle above the cards (30 days / 90 days / 12 months) changes Uptime, PM compliance
          and Avg repair time. The two cost cards always show 12 months and lifetime.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Card</th>
              <th className="px-3 py-2">What it shows</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {CARDS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>Hover any card for a one-line reminder of how it&apos;s calculated.</p>
      </Section>

      <Section id="uptime" title="How uptime is measured">
        <p>
          Uptime comes from the asset&apos;s <strong>status</strong>. Every time the status changes — from
          the asset&apos;s header, the Edit form, or a work order — Equipt records when it changed. Uptime
          is the time spent Active divided by the time spent in service:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Counts as</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATUSES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          <strong>Example.</strong> Over the last 90 days a dump truck was Active for 80 days and In Shop
          for 10: uptime is 80 ÷ 90 = 88.9%. If it had also sat Inactive for 30 days over the winter, those
          30 days wouldn&apos;t change the answer.
        </p>
        <p>
          <strong>Avg repair time</strong> is the average length of the In Shop / Out of Service stretches
          that both started and ended inside the window — a truck that&apos;s still in the shop counts
          toward downtime, but not toward the average until it comes back.
        </p>
        <Callout>
          <strong>Uptime is only as good as the status.</strong> Set a machine to In Shop when it goes down
          and back to Active when it&apos;s fixed. A mower that broke but stayed &quot;Active&quot; reads as
          100% up.
        </Callout>
      </Section>

      <Section id="costs" title="How maintenance cost is counted">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            A work order&apos;s cost is its <strong>parts</strong> (quantity × unit cost), plus{" "}
            <strong>labor</strong> (hours × rate), plus <strong>vendor charges</strong> — the same lines as
            its Costs tab.
          </li>
          <li>
            It&apos;s dated by when the work order was <strong>completed</strong>. A work order that&apos;s
            still open is dated by when it was created, so money already spent shows up right away.
          </li>
          <li>Skipped work orders don&apos;t count.</li>
          <li>
            <strong>PM</strong> is any work order typed Preventive or generated from a PM schedule or a
            meter automation. Everything else is <strong>Repair</strong>.
          </li>
          <li>
            Only work orders attached to the asset count — a sub-asset&apos;s costs aren&apos;t rolled up
            into its parent, and purchases that never touched a work order aren&apos;t included.
          </li>
        </ul>
      </Section>

      <Section id="pm-compliance" title="How PM compliance is scored">
        <p>
          PM compliance is scored against each schedule&apos;s <strong>calendar</strong>, not just against
          the work orders that happen to exist. Since PM work orders are generated by hand, a week nobody
          generated would otherwise vanish. Each PM on each asset lands in one of these buckets:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Means</th>
              <th className="px-3 py-2">Counts as</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {OUTCOMES.map(([name, desc, counts]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{counts}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          <strong>PM compliance</strong> = Done ÷ (Done + Missed). <strong>On-time rate</strong> = On time ÷
          (On time + Late).
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Multi-asset schedules count per asset.</strong> A weekly schedule on 3 mowers that
            nobody generated is 3 missed PMs that week, one on each mower&apos;s card.
          </li>
          <li>
            <strong>Meter-triggered PMs count too.</strong> An oil-change automation (Meter Threshold) comes
            due <strong>7 days</strong> after the meter trips. Its work order — whether the automation
            created it or someone converted the request — is on time if it&apos;s done within those 7 days.
          </li>
          <li>
            <strong>Paused schedules owe nothing.</strong> Cycles that fall inside a pause window aren&apos;t
            due, so they can&apos;t be missed. See{" "}
            <GuideLink href="/settings/support/pm-schedules-guide#pausing" className="text-[#60ab45] underline">
              Pausing a schedule
            </GuideLink>
            .
          </li>
        </ul>
      </Section>

      <Section id="worked-example" title="Worked example: a PM generated late">
        <p>
          A weekly schedule on 3 mowers is due Wednesday, Sep 23. The mechanic forgets to generate it.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Thursday onward</strong> — the Sep 23 cycle shows as 3 <em>Not generated</em> (missed)
            PMs, and each mower&apos;s PM compliance drops.
          </li>
          <li>
            <strong>Sunday, Sep 27 — someone generates it.</strong> The batch is due Sep 23 (the date it was
            actually due), and the schedule&apos;s Next Due moves to <strong>Sep 30</strong> — the next
            Wednesday, not a week from Sunday. The 3 misses become 3 open, overdue PMs.
          </li>
          <li>
            <strong>Monday — the work is done.</strong> They count as <em>Late</em>: PM compliance is back to
            where it was, and only the on-time rate takes the hit.
          </li>
          <li>
            <strong>Wednesday, Sep 30</strong> — generate the regular batch as usual. (The previous batch has
            to be done or skipped first; a schedule can only have one open batch at a time.)
          </li>
        </ol>
        <p>
          Had the schedule sat for three weeks instead, generating would create one batch for the oldest
          week; the two weeks it skipped past count as missed.
        </p>
      </Section>

      <Section id="reports" title="The three reports">
        <p>All three live at <strong>Equipt &gt; Reports</strong>.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>PM Compliance</strong> — compliance and on-time rate for the last 30 days to 12 months,
            missed PMs broken into not generated / skipped / overdue, a by-month chart, a table per PM
            schedule and meter rule (worst first), and a list of every missed PM.
          </li>
          <li>
            <strong>Uptime</strong> — fleet uptime, total downtime, average repair time and what&apos;s down
            right now, then a table per asset, worst uptime first. Filter to vehicles or equipment, and
            switch between assets with downtime and every asset in service.
          </li>
          <li>
            <strong>Warranties</strong> — counts of active, expiring and expired warranties, and the list
            filtered to the next 30 days, next 90 days, everything under warranty, expired, or no warranty
            on file. Disposed assets are left out.
          </li>
        </ul>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Downtime can&apos;t be edited after the fact.</strong> If a machine was down but nobody
            changed its status, the history won&apos;t know. Change the status going forward.
          </li>
          <li>
            <strong>Backdating a pause clears misses.</strong> A pause starting in the past removes that
            period&apos;s missed PMs from compliance. Pauses record who created them.
          </li>
          <li>
            <strong>A brand-new asset reads 100% (or 0%) quickly.</strong> With only minutes or days of
            history, one status change swings the percentage a lot. Longer windows settle it down.
          </li>
          <li>
            <strong>Hour-based warranties</strong> (e.g. 2,000 engine hours) aren&apos;t tracked against a
            meter — put them in Warranty Notes and use the end date for the calendar limit.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
