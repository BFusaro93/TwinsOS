import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const VISIT_STATUSES: [string, string][] = [
  ["Scheduled", "The default state for a newly created visit. Nothing has happened yet."],
  ["Dispatched", "Sent to a crew — picked from the status menu, set by Dispatch Assigned, or automatically the first time you print or send a crew their day. Dispatching writes a “Visit dispatched” entry to the client's Activity timeline."],
  ["In Progress", "The crew is on site. Picked from the status menu, or set automatically once a crew member clocks in on the crew app."],
  ["Completed", "The visit is done. Picked from the status menu, or set automatically once a crew member clocks out."],
  ["Skipped", "The crew did not perform this visit today, but it's expected to happen another time (weather, client not ready, access issue). Picked from the status menu or the visit detail sheet; you'll be asked for a reason, which is saved on the visit and logged on the client's Activity timeline."],
  ["Cancelled", "The visit was called off entirely and won't be rescheduled as-is. Picked from the status menu or the visit detail sheet; asks for a reason the same way Skipped does."],
];

const COLUMNS: [string, string][] = [
  ["Service, Date, City, Zip", "Identify the visit and where it is."],
  ["Assigned", "Which crew (or Unassigned) currently owns the visit."],
  ["Last Svc", "When this client was last serviced for this service — useful for spotting overdue recurring stops."],
  ["Start / End", "Scheduled arrival and departure window, editable inline."],
  ["B Hrs", "Budgeted hours — from the job's linked service (production rate × team size), or the job-level total as a last resort. Shown to two decimals."],
  ["Actual Hrs", "See the dedicated section below — this is the number that matters most for job costing. Shown to two decimals."],
  ["Hr Variance", "Actual minus budgeted, colored red when over and green when under."],
  ["Men", "Crew headcount used in the actual-hours fallback calculation. A value you set here is kept — editing the visit's times only fills Men in when it was blank."],
  ["Qty, Rate, AMT", "Billing quantity, unit rate, and the job's value — the sum of the job's included service lines, the same figure the visit sheet and the client's Jobs card show."],
  ["Notes/Icons", "Call-ahead flags, comments, and other at-a-glance indicators."],
];

export default function DispatchBoardGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="The Dispatch Board"
        description="The daily scheduling screen crews and dispatchers live in — visits, crews, status, and how actual hours get calculated."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where">Where it is</TOCLink>
          <TOCLink href="#jobs-and-visits">Jobs vs. visits</TOCLink>
          <TOCLink href="#status-cycle">Visit status and the status menu</TOCLink>
          <TOCLink href="#crews-and-assignment">Crews and assignment</TOCLink>
          <TOCLink href="#actual-hours">How actual hours are calculated</TOCLink>
          <TOCLink href="#worked-example">Worked example</TOCLink>
          <TOCLink href="#columns">Board columns</TOCLink>
          <TOCLink href="#filters-search">Filters, search, and routing</TOCLink>
          <TOCLink href="#see-also">See also</TOCLink>
        </div>
      </div>

      <Section id="where" title="Where it is">
        <p>
          <strong>CRM → Scheduling → Dispatch Board.</strong> The board shows one day at a time — use
          the week strip at the top to jump between days. It&apos;s built for a dispatcher planning today&apos;s
          work and for reviewing what actually happened once crews are done.
        </p>
      </Section>

      <Section id="jobs-and-visits" title="Jobs vs. visits">
        <p>
          A <strong>Job</strong> is the overall piece of work for a client (recurring lawn care,
          a one-time cleanup, a snow contract, etc.). A <strong>visit</strong> is one specific
          scheduled occurrence of that job — a single trip out to a property on a single day. A
          recurring job produces many visits over time; the Dispatch Board only ever shows visits,
          one day&apos;s worth at a time.
        </p>
        <Callout>
          Jobs and visits track status independently. A job&apos;s status (Scheduled, In Progress,
          Completed, Cancelled, Skipped, Hold) describes the whole engagement; a visit&apos;s status
          (Scheduled, Dispatched, In Progress, Completed, Cancelled, Skipped) describes just that
          one day&apos;s stop. Completing today&apos;s visit doesn&apos;t complete the job if it&apos;s recurring.
        </Callout>
      </Section>

      <Section id="status-cycle" title="Visit status and the status menu">
        <p>
          Every visit row shows a status icon in the <strong>ST</strong> column. <strong>Clicking it
          opens a status menu</strong> listing Scheduled, Dispatched, In Progress, Completed,
          Cancelled, and Skipped, with the current status highlighted. Pick the one you want and the
          visit changes on the spot — a toast (&quot;Visit marked Dispatched&quot;) confirms it. The
          same statuses are available from the dropdown in the visit&apos;s detail sheet.
        </p>
        <p>
          A single stray click on the icon no longer changes anything — it only opens the menu. That
          matters because moving a visit to Dispatched isn&apos;t just a label: it can fire
          &quot;visit dispatched&quot; automations and, as of now, writes to the client&apos;s Activity
          timeline, so it should always be a deliberate choice.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {VISIT_STATUSES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Skipped vs. Cancelled.</strong> Skipped means &quot;not today, but still expected&quot; —
          the client still gets this service, just not on this occurrence (rain day, gate locked,
          crew ran out of daylight). Cancelled means the visit itself is off the books and won&apos;t
          happen as scheduled. They mean different things operationally, so pick deliberately — the
          menu shows both side by side.
        </Callout>
        <p>
          <strong>Both outcomes ask for a reason.</strong> Choosing Skipped or Cancelled — from the
          status menu, a bulk status change, or the visit sheet — opens a short prompt with{" "}
          <strong>Weather</strong>, <strong>Client requested delay</strong>,{" "}
          <strong>Crew unavailable</strong>, or <strong>Other</strong> (with a free-text note). The
          reason is saved on the visit, where it can be edited later from the visit sheet, and is
          written to the client&apos;s Activity timeline as &quot;Visit skipped 9/9 — Weather&quot;
          (or &quot;Visit cancelled …&quot;), so the office can answer &quot;why didn&apos;t you
          come Tuesday?&quot; from the client record without opening the board.
        </p>
        <p>
          <strong>Skipped and cancelled visits drop out of the day&apos;s numbers.</strong> The{" "}
          <strong>Totals</strong> row, each crew&apos;s stat card, and the Unassigned card exclude
          them from <strong>AMT</strong> and budgeted hours, so a day where three stops rained out
          shows what the crews actually had in front of them, not what was originally on the
          calendar. The visits themselves stay on the board (and under the Skipped / Cancelled status
          tabs) — only the rollups leave them out.
        </p>
        <p>
          Status also advances itself in a couple of places outside the board: dispatching a crew&apos;s
          day (or printing/sending it) can move visits to Dispatched, and a crew member clocking in
          or out on the crew app moves the visit to In Progress or Completed automatically.
        </p>
      </Section>

      <Section id="crews-and-assignment" title="Crews and assignment">
        <p>
          Visits are grouped into a column per crew, plus an Unassigned column for anything not yet
          assigned. Assignment is drag-and-drop — drag a visit card onto a crew&apos;s column to assign it,
          or back onto Unassigned to pull it off. The header for each crew column shows how many
          stops that crew has for the day.
        </p>
        <p>
          A crew&apos;s headcount for a given day comes from its normal roster (set in crew settings),
          with same-day-only overrides layered on top from the <strong>Team Assignment</strong>{" "}
          dialog — useful when someone is on loan to a different crew just for today. A member
          reassigned this way is flagged as &quot;on loan&quot; for that date only and reverts to their usual
          crew automatically the next day.
        </p>
        <p>
          Within a crew, turning on <strong>Manual Route mode</strong> makes each visit row
          draggable so you can reorder the crew&apos;s stop sequence by hand (drag handle appears once the
          mode is on). It&apos;s off by default so that clicking into a Start/End time field to edit it
          doesn&apos;t accidentally register as a drag.
        </p>
        <p>
          Moving a visit to a different day — <strong>Move to Day</strong>, a drag on the board, or a
          bulk move — writes a &quot;Visit moved 9/7 → 9/8&quot; entry to the client&apos;s Activity
          timeline, so the client record shows when a stop was rescheduled without digging through
          the board&apos;s history.
        </p>
        <Callout>
          <strong>Package visits have spacing rules.</strong> If the visit belongs to a Package job
          whose steps set a <strong>Min Days</strong> gap, a move that would put a step too close to
          its neighbour is refused with a message like &quot;Step 2 must be at least 14 days after
          Step 1 (earliest 5/15)&quot; and the visit stays put. See the Jobs &amp; Packages guide.
        </Callout>
      </Section>

      <Section id="actual-hours" title="How actual hours are calculated">
        <p>
          The <strong>Actual Hrs</strong> column is the real number used for job costing and crew
          productivity reporting — it is not always literally &quot;time on site&quot; unless a crew clocks in
          and out. The value comes from a fallback chain, checked in this order:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>An explicit override</strong> — if a dispatcher has manually typed a number into
            Actual Hrs for the visit, that value wins outright and nothing below is used.
          </li>
          <li>
            <strong>Real clock-in/out punches</strong> — if a crew member clocked in and out on the
            crew app for this visit, actual hours = (clock-out time − clock-in time) × crew size.
          </li>
          <li>
            <strong>Scheduled Start/End time, as a fallback</strong> — if there&apos;s no clock data and
            no override, actual hours = (scheduled end time − scheduled start time) × the number of
            crew members assigned to the visit. This is the formula used for the vast majority of
            everyday visits, since most crews don&apos;t punch in/out per stop.
          </li>
        </ol>
        <p>
          Editing a visit&apos;s Start or End time clears any stale override so the number recalculates
          from the new times rather than silently keeping a number measured against the old schedule.
          It does <em>not</em> touch the <strong>Men</strong> count: a headcount you&apos;ve set on the
          visit is kept, and the times (or the crew&apos;s roster) only fill Men in when it was still
          blank. Hours are shown to two decimals everywhere on the board and in the visit sheet.
        </p>
        <Callout>
          <strong>Why the fallback matters.</strong> Without it, any visit a crew didn&apos;t clock
          in/out on would report zero actual hours — which would make job costing and crew
          productivity reports wildly understate labor cost on exactly the jobs where nobody bothered
          to punch a clock. Falling back to the scheduled duration × crew size gives every visit a
          reasonable, non-zero hours estimate by default, so reports stay usable even for crews that
          never touch the time clock. Clocking in/out with real times simply overrides that estimate
          with the truth once it&apos;s available.
        </Callout>
      </Section>

      <Section id="worked-example" title="Worked example">
        <p>
          A visit is scheduled 8:00 AM – 11:00 AM with a 3-person crew. Nobody clocks in or out, and
          no manual override is set.
        </p>
        <Table>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="w-56 px-3 py-2 align-top font-medium text-[#0a0a0a]">Fallback used</td>
              <td className="px-3 py-2 text-[#4a4a46]">Scheduled Start/End (no clock data)</td>
            </tr>
            <tr className="border-b border-[#eceae3]">
              <td className="w-56 px-3 py-2 align-top font-medium text-[#0a0a0a]">Calculation</td>
              <td className="px-3 py-2 text-[#4a4a46]">(11:00 AM − 8:00 AM) × 3 crew members = 3 hours × 3 = <strong>9 man-hours</strong></td>
            </tr>
          </tbody>
        </Table>
        <p>
          Now suppose the same 3-person crew instead clocks in at 8:15 AM and clocks out at 10:45 AM
          — real punches exist, so tier 2 takes over and the scheduled window is ignored entirely:
        </p>
        <Table>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="w-56 px-3 py-2 align-top font-medium text-[#0a0a0a]">Fallback used</td>
              <td className="px-3 py-2 text-[#4a4a46]">Real clock-in/out punches</td>
            </tr>
            <tr className="border-b border-[#eceae3]">
              <td className="w-56 px-3 py-2 align-top font-medium text-[#0a0a0a]">Calculation</td>
              <td className="px-3 py-2 text-[#4a4a46]">(10:45 AM − 8:15 AM) × 3 crew members = 2.5 hours × 3 = <strong>7.5 man-hours</strong></td>
            </tr>
          </tbody>
        </Table>
        <p>
          The clocked result (7.5) replaces the scheduled estimate (9) automatically — no manual
          intervention needed, and no override is written unless a dispatcher deliberately types one
          in.
        </p>
      </Section>

      <Section id="columns" title="Board columns">
        <p>
          Which columns are visible is configurable per user via the column-visibility control on the
          board toolbar. The full set:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Column(s)</th>
              <th className="px-3 py-2">What it shows</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {COLUMNS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="filters-search" title="Filters, search, and routing">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Status tabs</strong> — All, Scheduled, Dispatched, Completed, Cancelled, Skipped —
            filter the board down to visits in that state.
          </li>
          <li>
            <strong>Crew filter</strong> — a multi-select checklist to show only selected crews (plus
            &quot;All Crews&quot; to clear it).
          </li>
          <li>
            <strong>Search</strong> — a free-text box for finding a visit by client, address, or
            similar.
          </li>
          <li>
            <strong>Date range</strong> — an optional end date lets the board span more than a single
            day when you need to look ahead.
          </li>
          <li>
            <strong>Stats</strong> and <strong>Call Ahead</strong> panels — Stats gives a
            quick summary overlay for the visits currently in view; Call Ahead surfaces visits
            flagged as needing a courtesy call to the client before arrival.
          </li>
          <li>
            <strong>Print Route Sheets</strong> — generates a printable, per-crew stop sheet (client,
            address, service, time, budgeted hours, and notes to the crew) for the selected day,
            including a separate sheet for anything still unassigned.
          </li>
        </ul>
        <p>
          There&apos;s no live map view on the board — routing is handled by the crew stop order
          (drag-to-reorder in Manual Route mode), the <strong>Optimize Route</strong> action, and the
          printed route sheets. Optimize Route needs a Google Maps Platform API key with the Distance
          Matrix API enabled, entered under <strong>Landscapt Settings → Integrations</strong> on the
          Google Maps card. Type or paste the key and click <strong>Save Key</strong> — until you do,
          the card reads &quot;Unsaved — click Save Key to connect&quot; and the board can&apos;t use
          it. If the save comes back with &quot;you don&apos;t have permission to change organization
          settings,&quot; your role lacks the settings permission and an admin needs to enter the key
          instead.
        </p>
      </Section>

      <Section id="see-also" title="See also">
        <p>
          Jobs without a fixed date — waiting for weather, crew capacity, or a client window — don&apos;t
          live on the Dispatch Board at all until they&apos;re given a day and crew. See the{" "}
          <strong>Waiting List</strong> guide for how those get queued and dispatched.
        </p>
      </Section>
    </DocsFontScope>
  );
}
