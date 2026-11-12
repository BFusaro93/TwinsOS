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

const INVOICE_TYPES: [string, string, string][] = [
  [
    "Per Event",
    "A flat rate charged once per storm, no matter how deep it snows or how many times a crew came back out.",
    "$75 flat × 1 storm = $75.00",
  ],
  [
    "Per Inch (Event, or Push)",
    "A rate per inch of snowfall. “Per Event” prices the storm’s single deepest reading once; “Per Push” prices every visit separately off its own logged depth. Either can instead use interval billing — a table of inch ranges, each with its own flat rate (see Interval billing below).",
    "Event: $12/in × 6\" storm max = $72.00. Push: two 3\" pushes × $12/in = $36 + $36 = $72.00.",
  ],
  [
    "Hourly",
    "Hours on site × the job’s hourly rate — for jobs billed on time on site rather than snowfall. Billed once per visit, however many people were on the crew: from the crew app it’s clock-in to clock-out minus breaks; from the office Close Out it’s the hours you enter.",
    "1.5 hrs on site (3-person crew) × $150/hr = $225.00",
  ],
];

const SERVICE_RULES: [string, string, string][] = [
  ["Per Event", "As many as you need.", "Used — every service row is added together."],
  ["Per Event, Per Inch / Per Push", "One.", "Not used — the depth ranges (or Rate Per Inch) set the price."],
  ["Hourly", "One.", "Used — the service's Rate is the hourly rate."],
  ["Monthly Flat Rate", "As many as you need.", "Not used — the linked contract sets the price."],
];

export function SnowGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Snow Jobs & Storm Dispatch"
        description="Storm events, priority dispatch, and the invoicing flow built specifically for snow."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#storm-events">Storm events, not visits</TOCLink>
          <TOCLink href="#creating">Creating a storm event</TOCLink>
          <TOCLink href="#adding-jobs">Adding jobs and setting priority</TOCLink>
          <TOCLink href="#dispatch-close-out">Dispatching, logging pushes, closing out</TOCLink>
          <TOCLink href="#board-tools">Filters, crews, route order, map, and weather</TOCLink>
          <TOCLink href="#worked-scenario">Worked scenario: a 6&quot; storm</TOCLink>
          <TOCLink href="#invoicing">Snow invoicing and the three rate types</TOCLink>
          <TOCLink href="#interval-billing">Interval billing (rate by inches)</TOCLink>
          <TOCLink href="#services-on-snow-jobs">Services on a snow job: one per job, and when their price counts</TOCLink>
          <TOCLink href="#why-separate">Why snow billing has its own screen</TOCLink>
          <TOCLink href="#good-to-know">Good to know</TOCLink>
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
          every client with a snow job, or just the stops on a chosen master route. With no route
          chosen, the list follows your saved master-route order (route by route, stop by stop), with
          jobs on no route after them, and each stop picks up its route&apos;s default crew unless
          you choose a crew in the dialog. Each candidate
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
          The dialog always opens on the storm you&apos;re viewing: Dispatch Date is that
          storm&apos;s date and Max Trigger Inches its forecast. When you change a filter, any
          row it newly excludes is unticked, so a highlighted row only goes out if you tick it
          again yourself.
        </p>
        <p>
          Jobs are also excluded automatically if today isn&apos;t one of the days their contract
          authorizes service on. A snow job whose contract has ended (cancelled, expired, inactive,
          deleted or past its end date — unless the contract includes storms outside its dates)
          no longer appears on this board at all. Everything not excluded is pre-checked; uncheck or check
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
          skipped</strong>. Use <strong>Team Assign</strong> to move unassigned visits onto crews —
          drag a card, tap a card and then tap the crew column it should go to, or click a crew&apos;s
          name on the card for a one-tap assign. Then <strong>Dispatch Assigned</strong> pushes
          every crewed, scheduled visit to <code>dispatched</code> at once. <strong>Print</strong>{" "}
          generates a route sheet per crew with checkboxes for weather and site conditions, full
          plow, and salt bags, for a paper copy on the truck.
        </p>
        <Callout>
          <strong>Dispatching a storm from a tablet?</strong> Tap-to-place is the one that works
          there — touch devices don&apos;t support the drag gesture, so tap the visit, then tap the
          crew. The card you picked up is outlined and every crew you can drop it on is highlighted.
        </Callout>
        <p>
          The snow dispatch board fits phone widths too: the toolbar scrolls sideways and the
          controls get bigger tap targets below desktop width, so you can dispatch from a truck.
        </p>
        <p>
          <strong>Snowfall depth is not pulled from a weather feed — it&apos;s recorded manually,
          per visit, when the crew&apos;s work is closed out.</strong> Select one or more completed
          visits and click <strong>Close Out…</strong> to enter the actual depth (in), temperature,
          asset type used, any material (e.g. salt) with quantity and unit cost, and — for
          hourly-billed jobs — hours on site (the time the crew was at the property, not
          multiplied by crew size). Each visit is its own row with its own depth reading, closed
          out separately.
        </p>
        <p>
          <strong>Adding a push.</strong> A <strong>Per Push</strong> job bills every push on its
          own depth, so when a crew has to go back during a long storm, click{" "}
          <strong>Add push</strong> next to the client&apos;s name on that job&apos;s latest row. It
          adds the next push (marked <em>Push 2</em>, <em>Push 3</em>…) to the same storm with the
          same crew and men, at the end of the stop order and dated today, so it shows on the
          crew&apos;s list as its own stop. Close it out with its own depth like any other visit.
          Only Per Push jobs get extra pushes — a Per Event job is one visit per storm, and Add Jobs
          never adds a job that is already on the storm.
        </p>
        <p>
          Skipped and cancelled stops are never closed out: they were called off rather than
          plowed, so Close Out (and Close Out Selected) leave them alone and nothing is billed for
          them. Once every visit for the event is closed out, move the storm event&apos;s status to{" "}
          <strong>Complete</strong>.
        </p>
      </Section>

      <Section id="board-tools" title="Filters, crews, route order, map, and weather">
        <p>
          The Snow Jobs board has the same dark action bar as the Dispatch Board, so a storm can be
          run from one screen.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Status tabs and filters.</strong> Tabs for All, Scheduled, Dispatched, In
            Progress, Completed, Skipped and Cancelled (each with a count), a multi-select{" "}
            <strong>crew filter</strong> that includes <strong>Unassigned</strong>, and a{" "}
            <strong>search</strong> box that matches client, address, zip, notes and crew.
          </li>
          <li>
            <strong>Changing crews.</strong> The Crew column is a dropdown on every row. To move
            several stops, tick them and use <strong>Assign crew…</strong> in the selection bar.
            Setting a stop to Unassigned pins it to no crew rather than falling back to the
            job&apos;s crew. A stop shows the crew on its visit, or the job&apos;s crew if the visit
            has none — Team Assign uses the same rule.
          </li>
          <li>
            <strong>Route order.</strong> The <strong>#</strong> column is each stop&apos;s position
            within its crew&apos;s route; the arrows beside it move a stop up or down, and the
            order is saved. <strong>Optimize</strong> (next to a Nearest first / Furthest first
            choice) routes each crew separately by driving time, starting from the crew&apos;s own
            starting address or, failing that, the Company Address in Settings &gt; Organization,
            and saves the result. With rows selected it routes only those. After optimizing, each
            row shows the drive time to arrive at it (⌂ from the shop for the first stop, ↑ from the
            stop above for the rest).
          </li>
          <li>
            <strong>Actions menu.</strong> <em>Dispatch Selected</em> (or <em>Dispatch All
            Assigned</em> when nothing is selected), <em>Close Out Selected</em>, <em>Skip
            Selected</em> and <em>Cancel Selected</em>, Team Assign, Optimize Routes, Show Crew
            Stats, Print Route Sheets, and Clear Filters &amp; Selection.
          </li>
          <li>
            <strong>Keeping the same order storm to storm.</strong> Once you&apos;ve ordered the
            stops the way you want them (by hand or with Optimize), choose Actions &gt;{" "}
            <em>Save Order to Master Routes</em>. Each crew&apos;s order is written onto its master
            route (the active route whose default crew is that crew, created and named after the crew
            if there isn&apos;t one), so the next storm&apos;s Add Jobs comes up in that sequence.
            Stops that weren&apos;t on this storm keep their place on the route, jobs new to the route
            go on the end, and a job moved to another crew moves to that crew&apos;s route (a job is
            on only one route). You can also edit the order directly in Settings &gt; Services &gt;
            Snow Routes.
          </li>
          <li>
            <strong>Skip and cancel with a reason.</strong> Skipping or cancelling asks for a
            reason — No snow at this site, Client cancelled, Equipment down, Site inaccessible, or
            your own. It is saved on the visit and shown on the client&apos;s timeline. The status
            icon on a row still just cycles status without asking.
          </li>
          <li>
            <strong>Crew stats.</strong> <em>Show Crew Stats</em> opens a card per crew with stops,
            done, left, and billable total. Skipped and cancelled stops show a dash in the Amt column
            and are left out of the Totals row and the crew totals, since nothing is billed for them.
          </li>
          <li>
            <strong>Notes to crew.</strong> A column you edit in place: click the cell, type, Save.
            It saves on the visit only and shows the job&apos;s note until you override it.
          </li>
          <li>
            <strong>Columns.</strong> The column chooser shows or hides Address, City, Zip, Trigger,
            Crew, Depth, Temp, Notes to Crew and Amt, and remembers your choice.
          </li>
          <li>
            <strong>Map.</strong> The <strong>Map</strong> button plots the stops currently shown,
            numbered by route position and coloured by crew.
          </li>
          <li>
            <strong>Weather.</strong> A chip above the storm bar shows the National Weather Service
            forecast and any active alerts for the storm date (US only, within about a week). It is
            only a heads-up — depth and temperature on a visit are still entered by hand at
            close-out.
          </li>
        </ul>
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
            Assign</strong>, moves the High-priority clients onto the first crews out the door, and
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
          generating invoices twice never double-bills. A snow job linked to a contract is billed
          on the contract&apos;s cycle only while that contract is in force; once the contract is
          cancelled, expired, inactive or deleted, nothing else bills its visits, so they appear in
          this queue like any other snow visit &mdash; except storms inside a billing cycle the
          contract already invoiced (before it was cancelled, expired or switched off), which the
          contract price already paid for and stay out of the queue.
        </p>
        <p>
          <strong>Storms outside the contract dates.</strong> A storm visit dated before the
          contract&apos;s start date or after its end date is billed per event here by default. To
          have those storms covered by the contract price instead, open the contract and set{" "}
          <strong>Storms outside the contract dates</strong> (under its start and end dates) to{" "}
          <strong>Included in the contract</strong>. The setting appears once a snow job is linked
          to the contract, and changing it on a signed contract flags it as changed since signed.
        </p>
        <p>
          A per-inch visit with no recorded depth (for example one completed from the crew app,
          where only the office Close Out records depth) is never priced at the bottom range — it
          shows <em>no depth recorded</em>, prices at $0 and waits in the queue. Type the measured
          depth into the box under its Billing column and the amount updates. When you Close Out a
          mixed batch, the hours you enter are split across the hourly jobs only.
        </p>
        <p>
          <strong>Possibly already billed.</strong> An invoice made by hand for a snow push has no
          link back to the visit, so the visit would stay in the queue. When a queued visit&apos;s
          job already has a non-void invoice line for the same service date, the row shows an
          amber <strong>Possibly billed on invoice #N</strong> tag (or &ldquo;a draft invoice&rdquo;
          if that invoice has no number yet). If you generate with any of those visits selected,
          you&apos;re asked to confirm &mdash; <strong>Bill anyway</strong> bills it again, or
          cancel and check that invoice first.
        </p>
        <p>
          <strong>Voided or deleted invoices release their visits.</strong> If you void (or delete)
          a snow invoice because the depth or rate was wrong, the storm visits it billed go straight
          back into the Snow Invoicing queue so you can bill them correctly &mdash; they&apos;re no
          longer treated as invoiced.
        </p>
        <p>
          <strong>Snow invoices carry the client&apos;s terms.</strong> Each generated invoice takes
          the client&apos;s Invoice terms (or the company default), gets a matching due date so it
          ages and appears in past-due reminders, and copies the job&apos;s PO number and sales rep
          when the invoice covers a single job.
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
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{example}</td>
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

      <Section id="interval-billing" title="Interval billing (rate by inches)">
        <p>
          Many snow contracts price by bands of snowfall rather than a straight rate per inch — for
          example 0–3&quot; is $165, 3–6&quot; is $299, and 6–9&quot; is $422. That is{" "}
          <strong>interval billing</strong>, and you set it while creating the job: choose{" "}
          <strong>Per Event, Per Inch</strong> or <strong>Per Push</strong> as the invoice type and
          an <strong>Interval Billing — Rate by Inches</strong> table appears. Click{" "}
          <strong>Add Range</strong> for each band (from, to, flat rate). Leave the last range&apos;s{" "}
          <em>to</em> blank for an open-ended top band billed per inch (for example 12&quot;+ at
          $57 per inch). The same table is on the job&apos;s Details tab afterwards, with a{" "}
          <strong>Save Ranges</strong> button.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Per Event, Per Inch</strong> prices the storm&apos;s single deepest reading
            against the ranges. <strong>Per Push</strong> prices each visit by its own recorded
            depth against the ranges.
          </li>
          <li>
            Start each range where the previous one ends (0–3, 3–6, 6–9). A depth exactly on a
            boundary bills the <strong>lower</strong> range — exactly 3&quot; is the 0–3 band, and
            3.1&quot; is the 3–6 band. Saving ranges with a gap or an overlap between them is
            refused with a message saying where. Ranges saved earlier with a small gap (0–3,
            3.01–6) still work: a depth inside the gap bills the lower range.
          </li>
          <li>
            <strong>Pricing bands that end in .99</strong> (0–1.99&quot;, 2–3.99&quot;, 4–5.99&quot;,
            6–7.99&quot;, where exactly 4&quot; counts as the <em>4–5.99</em> band): because a
            boundary depth bills the lower range and ranges can&apos;t have gaps, enter them as{" "}
            <strong>0–1.99, 1.99–3.99, 3.99–5.99, 5.99–7.99</strong>. A push recorded at 4&quot; then
            lands in 3.99–5.99 and bills the 4–5.99 price. Depths above the last range bill $0 unless
            the last range is left open-ended, so price anything deeper by hand or add a top range.
          </li>
          <li>
            <strong>A flat price per push</strong> (the same amount whatever the depth, for example a
            drive-lane-only push) is a Per Push job with a single range, such as 0–99&quot; at the
            flat amount. The visit still needs a recorded depth to price; with none it waits in the
            Snow Invoicing queue at $0.
          </li>
          <li>
            If no range matches a depth (below the first range, or above the last one with no
            open-ended range), it falls back to the flat <strong>Rate Per Inch</strong> on the job.
            Only the last range may be open-ended.
          </li>
          <li>
            The Snow Jobs board totals and the Snow Invoicing queue both price from the ranges, and
            the queue&apos;s description column says when a row used them.
          </li>
        </ul>
      </Section>

      <Section id="services-on-snow-jobs" title="Services on a snow job: one per job, and when their price counts">
        <p>
          A snow job&apos;s invoice type decides whether the Services table matters for billing, so
          the job form limits it. Make one job per service (plowing, sidewalks, de-icing), each with
          its own invoice type and depth ranges, rather than one job with several services.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Invoice type</th>
              <th className="px-3 py-2">Services on the job</th>
              <th className="px-3 py-2">Service price</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {SERVICE_RULES.map(([name, count, price]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{count}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{price}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            When the price isn&apos;t used, the Rate field shows <em>Not used</em> and the job is
            saved with a $0 service price. Billing never read it, and a price there would only
            have inflated the job&apos;s value in reports.
          </li>
          <li>
            The <strong>Add Service</strong> button is disabled once a one-service type has its
            service. Choosing such a type after adding several services keeps the first and
            clears the prices, and the form says so. The same limits apply to the Services tab of
            an existing job and are enforced in the database, so imports and the API follow them
            too.
          </li>
          <li>
            <strong>Monthly Flat Rate</strong> does not invoice by itself. It bills only through a
            linked, active contract that generates invoices automatically, so saving the job
            requires choosing the client&apos;s contract; without one it would never be billed. Its
            storm visits stay out of the Snow Invoicing queue.
          </li>
        </ul>
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
          <GuideLink href="/settings/support/dispatch-board-guide" className="text-[#60ab45] hover:underline">
            Dispatch Board guide
          </GuideLink>{" "}
          for how the daily list-view board assigns and dispatches ordinary jobs. Snow storm
          dispatch is intentionally its own storm-event-centric flow rather than a daily board,
          since a storm doesn&apos;t respect calendar days the way a regular route does.
        </p>
      </Section>
      <Section id="good-to-know" title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Subcontractors.</strong> Set up each subcontractor as its own crew. There is no
            separate subcontractor setting on a snow job, and you don&apos;t need to add them as a
            vendor just to dispatch them. Go to <strong>Team → Crews</strong>, create a crew named
            for the subcontractor (for example &quot;Sub – Smith Plowing&quot;), then add their
            people under <strong>Team Assignments</strong>. Set those employees&apos; employment
            status to <strong>Contractor</strong> so they show on the Contractor Phone List report.
            If their truck should show on the board, add it to the Vehicles registry in Equipt and
            load it onto that crew from the Equipment yard (use the pin to make it the crew&apos;s
            default). Then assign their stops to that crew like any other crew. Add them as a
            vendor only if you also want to track what you pay them through purchasing or on a
            project&apos;s Other Costs.
          </li>
          <li>
            <strong>Status icon.</strong> Tapping a stop&apos;s status icon steps it forward through Scheduled, Dispatched and In Progress, and asks before marking it Completed (which invoices it) or reopening a completed stop. Skip a stop from the outcome dialog with a reason.
          </li>
          <li>
            <strong>Reordering.</strong> The up and down arrows are disabled while a new order is saving, so two quick taps can&apos;t swap the wrong stops.
          </li>
          <li>
            <strong>Tax-exempt clients.</strong> Snow invoices for a client marked tax-exempt carry no tax, even when the job came from a taxed estimate.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
