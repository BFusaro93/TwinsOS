import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const INVOICE_TYPES: [string, string, string][] = [
  [
    "Per Event",
    "A flat rate charged once per storm, no matter how deep it snows or how many times a crew came back out.",
    "$75 flat × 1 storm = $75.00",
  ],
  [
    "Per Inch (Event, or Push)",
    "A rate per inch of snowfall. “Per Event” prices the storm’s single deepest reading once; “Per Push” prices every visit separately off its own logged depth.",
    "Event: $12/in × 6\" storm max = $72.00. Push: two 3\" pushes × $12/in = $36 + $36 = $72.00.",
  ],
  [
    "Hourly",
    "Actual hours logged at close-out × the job’s hourly rate — for jobs billed on time on site rather than snowfall.",
    "1.5 hrs × $150/hr = $225.00",
  ],
];

export default function SnowGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt / CRM"
        title="Snow Jobs & Storm Dispatch"
        description="Storm events, priority dispatch, and the invoicing flow built specifically for snow."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#storm-events">Storm events, not visits</TOCLink>
          <TOCLink href="#creating">Creating a storm event</TOCLink>
          <TOCLink href="#adding-jobs">Adding jobs and setting priority</TOCLink>
          <TOCLink href="#dispatch-close-out">Dispatching, logging pushes, closing out</TOCLink>
          <TOCLink href="#worked-scenario">Worked scenario: a 6&quot; storm</TOCLink>
          <TOCLink href="#invoicing">Snow invoicing and the three rate types</TOCLink>
          <TOCLink href="#why-separate">Why snow billing has its own screen</TOCLink>
        </div>
      </div>

      <Section id="storm-events" title="Storm events, not visits">
        <p>
          Snow Jobs lives at <strong>CRM &gt; Scheduling &gt; Snow Jobs</strong>, and everything on
          that board is organized around a <strong>Storm Event</strong> — not individual visits.
          Instead of scheduling each client&apos;s plow separately, you create one event for the
          storm itself, add every client who needs service during it, and dispatch them together in
          priority order.
        </p>
        <p>
          A storm event tracks a name, a date, an optional forecast depth, and an optional
          temperature. It also carries its own status —{" "}
          <strong>Pending → Working → Complete</strong> — which reflects the storm&apos;s actual
          life cycle: not yet touched, actively being dispatched and pushed, or wrapped up.
        </p>
      </Section>

      <Section id="creating" title="Creating a storm event">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            From the Snow Jobs board, click <strong>+ New Storm Event</strong>.
          </li>
          <li>
            The name defaults to <code>Snow Event</code> plus today&apos;s date — rename it if you
            want something more specific (e.g. &quot;Feb 3 Nor&apos;easter&quot;).
          </li>
          <li>
            Set the <strong>event date</strong>. Optionally set a <strong>forecast depth</strong>{" "}
            (inches) and a <strong>temperature</strong> — the forecast depth is used later, when
            adding jobs, to automatically exclude clients whose contract only triggers at a higher
            depth than this storm is expected to drop.
          </li>
          <li>
            The event opens on the board with status <strong>Pending</strong> until you start
            dispatching.
          </li>
        </ol>
      </Section>

      <Section id="adding-jobs" title="Adding jobs and setting priority">
        <p>
          Click <strong>Add Jobs</strong> on an open storm event to bring up the candidate list —
          every client with a snow job, or just the stops on a chosen master route. Each candidate
          shows its trigger depth, its client&apos;s priority, and its assigned crew, and the list
          filters itself with three controls:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Max Trigger Inches</strong> — defaults to the storm&apos;s forecast depth. Any
            client whose own trigger depth (the snowfall needed before their contract kicks in) is
            higher than this number is highlighted and excluded by default — this storm isn&apos;t
            deep enough to trigger their service.
          </li>
          <li>
            <strong>Min Priority</strong> — each client has a <code>priority</code> of{" "}
            <strong>High</strong>, <strong>Normal</strong>, or <strong>Low</strong>. Choosing
            &quot;High and higher&quot; here narrows the list to just your High-priority accounts;
            &quot;Low and higher&quot; (the default) includes everyone.
          </li>
          <li>
            <strong>Default Crew</strong> — applied to any selected job that doesn&apos;t already
            have a crew assigned.
          </li>
        </ul>
        <p>
          Jobs are also excluded automatically if today isn&apos;t one of the days their contract
          authorizes service on. Everything not excluded is pre-checked; uncheck or check
          individual rows before clicking <strong>Add to Dispatch</strong>.
        </p>
        <Callout>
          Priority lives on the <strong>client</strong>, not the storm event — set it once on the
          client record and every future storm respects it. High-priority clients (hospitals, fire
          lanes, contracts with tight response-time SLAs) sort first wherever priority matters.
        </Callout>
      </Section>

      <Section id="dispatch-close-out" title="Dispatching, logging pushes, closing out">
        <p>
          Once jobs are added, each one becomes a visit row on the board with a status you cycle
          through by clicking its icon: <strong>scheduled → dispatched → in progress → completed →
          skipped</strong>. Use <strong>Team Assign</strong> to drag unassigned visits onto crews (or
          click a crew&apos;s name on each card), then <strong>Dispatch Assigned</strong> to push
          every crewed, scheduled visit to <code>dispatched</code> at once. <strong>Print</strong>{" "}
          generates a route sheet per crew with checkboxes for weather and site conditions, full
          plow, and salt bags, for a paper copy on the truck.
        </p>
        <p>
          <strong>Snowfall depth is not pulled from a weather feed — it&apos;s recorded manually,
          per visit, when the crew&apos;s work is closed out.</strong> Select one or more completed
          visits and click <strong>Close Out…</strong> to enter the actual depth (in), temperature,
          asset type used, any material (e.g. salt) with quantity and unit cost, and — for
          hourly-billed jobs — actual hours on site. This is also how a &quot;push&quot; gets
          logged: if a crew visits a client twice during one long storm (morning and afternoon), each
          visit is its own row with its own depth reading, closed out separately.
        </p>
        <p>
          Once every visit for the event is closed out, move the storm event&apos;s status to{" "}
          <strong>Complete</strong>.
        </p>
      </Section>

      <Section id="worked-scenario" title="Worked scenario: a 6&quot; storm">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            A dispatcher sees a storm coming and clicks <strong>+ New Storm Event</strong>, names it,
            sets the date, and enters a forecast depth of <strong>6&quot;</strong>.
          </li>
          <li>
            They click <strong>Add Jobs</strong>. With Max Trigger Inches defaulted to 6, every
            client whose contract needs more than 6&quot; to trigger is auto-excluded. Out of the
            org&apos;s full snow client list, <strong>40 clients</strong> qualify and get added to
            the event, each carrying the priority already set on their client record.
          </li>
          <li>
            The event moves to <strong>Working</strong>. The dispatcher opens <strong>Team
            Assign</strong>, drags the High-priority clients onto the first crews out the door, and
            dispatches them — hospitals, fire lanes, and SLA accounts get plowed first, before the
            Normal- and Low-priority stops.
          </li>
          <li>
            As the storm continues, some clients need a second pass. Crews return, and each return
            visit is closed out on its own with its own depth reading — a morning push logged at
            3&quot;, an afternoon push logged at another 3&quot; once the storm finishes dropping
            its full 6&quot;.
          </li>
          <li>
            Once every crew has closed out every visit, the dispatcher sets the storm event&apos;s
            status to <strong>Complete</strong>. The event is now ready for Snow Invoicing.
          </li>
        </ol>
      </Section>

      <Section id="invoicing" title="Snow invoicing and the three rate types">
        <p>
          <strong>CRM &gt; Accounting &gt; Snow Invoicing</strong> groups a client&apos;s uninvoiced
          storm visits and computes the amount from the job&apos;s own invoice type — a flat rate
          per storm event, a rate per inch of snowfall (charged once per event, or separately per
          push), or an hourly rate times actual hours logged. Only completed, non-contract snow
          visits that don&apos;t already have an invoice line item appear in the queue, so
          generating invoices twice never double-bills.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Invoice type</th>
              <th className="px-3 py-2">How it&apos;s computed</th>
              <th className="px-3 py-2">Worked example (same 6&quot; storm)</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {INVOICE_TYPES.map(([name, desc, example]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{example}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          For Per Event and Per Event/Per Inch jobs, every visit on the storm collapses into one
          charge — a morning push and an afternoon push during the same event are one line, priced
          off the storm&apos;s single deepest reading, not two separate charges. Per Push and
          Hourly jobs are the opposite: each visit prices and invoices on its own.
        </p>
      </Section>

      <Section id="why-separate" title="Why snow billing has its own screen">
        <p>
          A regular Landscapt invoice itemizes a fixed, known job — a monthly mow, a package
          installment — where the amount is settled the moment the invoice is written. Snow
          doesn&apos;t work that way: a single storm can generate several visits per client over
          hours or days, and the price isn&apos;t knowable until the storm is over and every visit
          has been closed out with its actual depth or hours. Snow Invoicing exists because that
          accumulate-then-rate step — grouping a client&apos;s visits by storm event, applying the
          job&apos;s own rate type to the group, and only then producing a line item — has no
          equivalent in the regular Invoicing screen&apos;s one-job-one-line model.
        </p>
        <Callout>
          Because grouping and pricing both key off the storm event and the job&apos;s invoice
          type, a visit created outside the storm dispatch flow (say, logged directly from the
          field) still bills correctly — it just falls back to grouping by date instead of by
          storm event.
        </Callout>
      </Section>

      <Section id="see-also" title="See also">
        <p>
          Day-to-day, non-snow visit dispatch uses a different screen entirely — see the{" "}
          <a href="/settings/support/dispatch-board-guide" className="text-[#60ab45] hover:underline">
            Dispatch Board guide
          </a>{" "}
          for how the daily list-view board assigns and dispatches ordinary jobs. Snow storm
          dispatch is intentionally its own storm-event-centric flow rather than a daily board,
          since a storm doesn&apos;t respect calendar days the way a regular route does.
        </p>
      </Section>
    </DocsFontScope>
  );
}
