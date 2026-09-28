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

const FREQUENCIES: [string, string][] = [
  ["Daily", "Every day."],
  ["Weekly", "Every 7 days — the same weekday every week."],
  ["Monthly", "Every calendar month, on the same day of the month (clamped to the month's last day when it's shorter)."],
  ["Quarterly", "Every 3 calendar months, same rule."],
  ["Annually", "Every 12 calendar months, same rule."],
];

const WORKED_EXAMPLE_ASSETS: [string, string, string][] = [
  ["Mower #1 – Toro Z Master", "Toro 100-3743", "$14.50"],
  ["Mower #2 – Toro Z Master", "Toro 100-3743", "$14.50"],
  ["Mower #3 – Exmark Lazer Z", "Exmark 116-2261", "$11.25"],
  ["Mower #4 – Exmark Lazer Z", "Exmark 116-2261", "$11.25"],
  ["Mower #5 – Scag Turf Tiger", "Scag 48069", "$16.00"],
  ["Mower #6 – Scag Turf Tiger", "Scag 48069", "$16.00"],
  ["Mower #7 – Ferris IS 700", "Ferris 5021378", "$13.75"],
  ["Mower #8 – Ferris IS 700", "Ferris 5021378", "$13.75"],
];

export function PMSchedulesGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Equipt (CMMS)"
        title="Preventive Maintenance Schedules"
        description="Calendar-based recurring service, from one schedule covering a whole fleet down to per-asset parts."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#basics">The basics</TOCLink>
          <TOCLink href="#worked-example">Worked example: fleet-wide seasonal PM</TOCLink>
          <TOCLink href="#due-dates">How &quot;due&quot; is calculated</TOCLink>
          <TOCLink href="#generating-wos">Generating work orders</TOCLink>
          <TOCLink href="#late">Generating late (or early)</TOCLink>
          <TOCLink href="#pausing">Pausing a schedule (off-season)</TOCLink>
          <TOCLink href="#compliance">PM compliance</TOCLink>
          <TOCLink href="#parts">Parts, two levels</TOCLink>
          <TOCLink href="#calendar-vs-meter">Calendar-based vs. meter-based</TOCLink>
          <TOCLink href="#notifications">Notifications</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="basics" title="The basics">
        <p>
          Go to <strong>CMMS &gt; PM Schedules</strong> and click <strong>+ New PM Schedule</strong>.
          A schedule needs four things: a title, one or more assets/vehicles, a frequency, and a
          next due date. Optionally add a default assignee and a description of the work.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Frequency</strong> — Daily, Weekly, Monthly, Quarterly, or Annual.
          </li>
          <li>
            <strong>Assets / Vehicles</strong> — one schedule can cover many. This is a real
            multi-select: use the combobox to add assets one at a time, and remove any of them
            later from the same field or from the schedule&apos;s Assets tab.
          </li>
          <li>
            <strong>Default Assignee</strong> — optional. Whoever you pick here is automatically
            assigned to every work order this schedule generates, on every asset.
          </li>
          <li>
            <strong>Instructions / Description</strong> — free text describing the maintenance
            tasks. It applies to all assets on the schedule; use per-asset parts (below) for
            anything that differs by asset.
          </li>
        </ul>
      </Section>

      <Section id="worked-example" title="Worked example: fleet-wide seasonal PM">
        <p>
          Say you want one routine — &quot;Spring Mower Tune-Up&quot; — to hit all 8 mowers on the
          crew before the season starts, but the oil filter part number differs by mower model.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Click <strong>+ New PM Schedule</strong>, title it{" "}
            <strong>Spring Mower Tune-Up</strong>, set Frequency to <strong>Annual</strong>, and
            pick a Next Due Date (e.g. the target start-of-season date).
          </li>
          <li>
            In the Assets field, add all 8 mowers one at a time — the picker resets after each
            selection so you can keep adding without re-opening it. Each shows as a removable
            badge above the field.
          </li>
          <li>
            Add general instructions in the Description field (e.g. &quot;Oil + filter change,
            blade sharpen/balance, air filter, spark plug, belt inspection, deck wash&quot;) — this
            text is shared by every mower on the schedule.
          </li>
          <li>
            Save the schedule, then open it and go to its <strong>Assets</strong> tab. Each mower
            is its own row; click a row to expand it and add that mower&apos;s specific parts with
            quantity and unit cost.
          </li>
        </ol>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Asset row</th>
              <th className="px-3 py-2">Oil filter part #</th>
              <th className="px-3 py-2">Unit cost</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {WORKED_EXAMPLE_ASSETS.map(([asset, part, cost]) => (
              <tr key={asset} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{asset}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{part}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{cost}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          One schedule, one due date, one generation click — but each mower&apos;s work order still
          carries the correct filter part number and cost for its own model.
        </p>
      </Section>

      <Section id="due-dates" title="How &quot;due&quot; is calculated">
        <p>
          A PM schedule doesn&apos;t derive its due date from a separate start date — the{" "}
          <strong>Next Due Date</strong> field you set <em>is</em> the schedule&apos;s calendar.
          Every later cycle lands on that same cadence: a weekly schedule first due on a Wednesday is
          due every Wednesday. There&apos;s no background job silently recalculating it; the date only
          moves when work orders are generated, described below.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2">How the next due date advances</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {FREQUENCIES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Month-end edge case.</strong> A schedule due Jan 31 on a Monthly frequency lands
          on Feb 28 (or 29), not an overflow date like Mar 3 — the system clamps to the last valid
          day of the target month instead of letting the date roll into the following month. Worth
          knowing if you set up a schedule anchored to a month-end date.
        </Callout>
      </Section>

      <Section id="generating-wos" title="Generating work orders">
        <p>
          Work orders aren&apos;t created automatically just because a date has passed — someone
          (or the PM Due Reminder automation, see below) generates them from the schedule. What
          gets created depends on how many assets are on the schedule:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Single asset</strong> — one flat work order, with that asset attached directly.
          </li>
          <li>
            <strong>Multiple assets</strong> — one parent work order plus a sub-work order per
            asset, each carrying its own asset and its own copied-over parts list.
          </li>
        </ul>
        <p>
          Every generated work order is <strong>due on the schedule&apos;s Next Due Date</strong> —
          the date this PM was actually due, which is what on-time vs. late is judged against. The
          moment work orders are generated, Next Due moves to the next date on the schedule&apos;s
          cadence. Marking the resulting work order done doesn&apos;t separately move the date;
          generation is what advances it.
        </p>
        <Callout>
          <strong>Duplicate guard.</strong> You can&apos;t generate a new batch of work orders for a
          schedule while an earlier batch is still open (not done or skipped). Close out the
          existing work order(s) first, or the generate action is blocked with an error naming the
          still-open WO.
        </Callout>
      </Section>

      <Section id="late" title="Generating late (or early)">
        <p>Because the calendar keeps its cadence, generating on the &quot;wrong&quot; day doesn&apos;t shift the schedule:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>A week late.</strong> A weekly schedule due Wednesday, Sep 23 is generated on Sunday,
            Sep 27. The batch is due Sep 23 (so it counts as late, not missed, once it&apos;s done), and
            Next Due becomes <strong>Wednesday, Sep 30</strong> — not the following Sunday. Finish the
            late batch, then generate Wednesday&apos;s as usual.
          </li>
          <li>
            <strong>Several weeks late.</strong> Generating creates one batch for the oldest missed week
            and moves Next Due to the next Wednesday from today. The weeks in between count as missed —
            generating late doesn&apos;t erase them.
          </li>
          <li>
            <strong>On the day the next one is due.</strong> Generating last week&apos;s batch on this
            Wednesday leaves this Wednesday due — it isn&apos;t skipped.
          </li>
          <li>
            <strong>Early.</strong> Generating Tuesday for a Wednesday PM makes the batch due Wednesday
            and moves Next Due one week past that.
          </li>
        </ul>
      </Section>

      <Section id="pausing" title="Pausing a schedule (off-season)">
        <p>
          Mowers don&apos;t need weekly service in January. Open the schedule and click{" "}
          <strong>Pause</strong> (next to Generate WOs). Choose when the pause starts and one of:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>A resume date</strong> — e.g. a truck parked for a month. The schedule runs again on
            that date.
          </li>
          <li>
            <strong>Until I resume it</strong> — open-ended. A <strong>Resume</strong> button replaces
            Pause while it&apos;s paused.
          </li>
          <li>
            <strong>Repeat every year</strong> — set Dec 1 → Apr 1 once and the schedule pauses every
            winter from then on. It needs a resume date and can&apos;t be longer than a year.
          </li>
        </ul>
        <p>While a schedule is paused:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Cycles that fall inside the pause <strong>aren&apos;t due</strong> — nothing is overdue and
            nothing counts against PM compliance.
          </li>
          <li>
            <strong>Generate WOs is disabled</strong>, and the PM Due alert and the PM Due Reminder
            automation skip it.
          </li>
          <li>
            The schedule shows <strong>Paused</strong> in the list and <strong>Paused until Apr 1</strong>{" "}
            (or just Paused) in its header.
          </li>
          <li>
            When it resumes, the first PM due is the first date on its cadence after the pause — not a
            stale date from before it.
          </li>
        </ul>
        <p>
          Every pause window is listed on the schedule&apos;s Details tab. Remove one with its{" "}
          <strong>×</strong> button — that removes the whole window, so removing a yearly pause removes it
          for every year.
        </p>
        <Callout>
          <strong>A yearly pause can&apos;t be ended early for just one year.</strong> If spring comes
          early, remove the yearly pause and add it back (starting next winter), or add a one-off pause
          for this year only. Pauses can also be backdated — a pause that starts in the past clears that
          period&apos;s missed PMs, so use it for time the equipment really was parked.
        </Callout>
      </Section>

      <Section id="compliance" title="PM compliance">
        <p>
          Each asset&apos;s Performance cards and <strong>Equipt &gt; Reports &gt; PM Compliance</strong>{" "}
          score PMs against the schedule&apos;s calendar: every cycle whose due date has passed counts
          as done or missed — including cycles nobody generated. A multi-asset schedule counts once per
          asset. Paused cycles don&apos;t count at all.
        </p>
        <p>
          For the exact rules — every outcome, and how meter-triggered PMs count — see{" "}
          <GuideLink href="/settings/support/asset-performance-guide#pm-compliance" className="text-[#60ab45] underline">
            Asset Performance, Warranties &amp; Reliability Reports
          </GuideLink>
          .
        </p>
      </Section>

      <Section id="parts" title="Parts, two levels">
        <p>Parts show up on a PM schedule at two different levels — they serve different purposes:</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2">Where</th>
              <th className="px-3 py-2">Use it for</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">Schedule-level</td>
              <td className="px-3 py-2 text-[#4a4a46]">Parts tab on the schedule itself</td>
              <td className="px-3 py-2 text-[#4a4a46]">
                Parts expected for the routine in general, shared across every asset on the
                schedule.
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">Per-asset</td>
              <td className="px-3 py-2 text-[#4a4a46]">Assets tab, expand a specific asset row</td>
              <td className="px-3 py-2 text-[#4a4a46]">
                A parts template scoped to just that one asset — quantity and unit cost included.
                This is what gets copied onto that asset&apos;s work order (or sub-work order) when
                the schedule generates.
              </td>
            </tr>
          </tbody>
        </Table>
        <p>
          Use per-asset parts whenever a mixed fleet needs different part numbers for the same
          routine — different oil filters, different belts — as in the worked example above.
        </p>
      </Section>

      <Section id="calendar-vs-meter" title="Calendar-based vs. meter-based">
        <p>
          A PM Schedule is <strong>calendar-based</strong>: it fires on a fixed cadence (weekly,
          monthly, etc.) regardless of how much the asset is actually used. Equipt&apos;s{" "}
          <strong>Automations</strong> (CMMS &gt; Automations) can also trigger recurring
          maintenance from a <strong>Meter Threshold</strong> — engine hours, odometer miles, and
          similar values that accrue with usage — which is <strong>usage-based</strong> instead of
          date-based.
        </p>
        <p>They&apos;re independent mechanisms, and nothing stops you from using both on the same asset:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            A PM Schedule catches maintenance that should happen on a schedule no matter what —
            e.g. a seasonal tune-up before spring, regardless of hours logged.
          </li>
          <li>
            A meter-threshold automation catches maintenance that should happen based on wear —
            e.g. an oil change every 200 engine hours, whether that takes two weeks or two months
            depending on how busy the crew is.
          </li>
          <li>
            Running both on the same asset (e.g. a mower) means whichever condition is met first —
            the calendar date or the meter value — is what triggers that particular maintenance
            event. They don&apos;t coordinate with or cancel each other.
          </li>
        </ul>
      </Section>

      <Section id="notifications" title="Notifications">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            PM schedules due within 7 days surface in the Notifications bell as &quot;PM
            Due&quot; alerts — except schedules that are paused today.
          </li>
          <li>
            The <strong>PM Due Reminder</strong> automation template (CMMS &gt; Automations) can
            also generate a work order automatically ahead of the due date, instead of waiting for
            someone to click Generate manually.
          </li>
          <li>
            Marking the resulting work order complete is the normal way a PM schedule&apos;s cycle
            closes out day to day — but remember it&apos;s <em>generating</em> the work order, not
            completing it, that actually advances the schedule&apos;s next due date.
          </li>
        </ul>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>No assets, no generation.</strong> A schedule with zero linked assets can be
            saved as a draft-like shell, but generating work orders from it is blocked until at
            least one asset is added.
          </li>
          <li>
            <strong>Frequency values differ slightly by context.</strong> PM Schedules use{" "}
            <code>annual</code> for a yearly cadence; the similarly-named recurring-work-order
            frequency elsewhere in CMMS uses <code>yearly</code> plus a <code>biweekly</code>{" "}
            option that PM Schedules don&apos;t have. They&apos;re not the same field — don&apos;t
            assume one implies the other.
          </li>
          <li>
            <strong>Inactive vs. Paused.</strong> Older schedules may show <strong>Inactive</strong> — a
            legacy flag with no dates behind it. Inactive schedules don&apos;t pile up missed PMs going
            forward, but use Pause instead: it records when the schedule was off, so the history stays
            right.
          </li>
          <li>
            <strong>Removing an asset from a schedule</strong> only affects future generations —
            it doesn&apos;t retroactively touch work orders already created from that schedule.
          </li>
          <li>
            <strong>Parts on generation deduct inventory immediately.</strong> Any per-asset part
            with a linked inventory part is deducted from <code>quantity_on_hand</code> the moment
            work orders are generated, not when the work order is later marked done.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
