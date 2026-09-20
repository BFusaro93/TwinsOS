import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const STOP_ACTIONS: [string, string][] = [
  [
    "Start Job",
    "You're on site and starting work. Your clock starts now, and the stop moves to In Progress on the office's dispatch board.",
  ],
  [
    "Take a Break",
    "Lunch, or anything else that shouldn't be billed. The clock keeps running on screen but the paused minutes are subtracted at the end.",
  ],
  ["Resume", "Back to work. Shown in place of Take a Break while you're on a break."],
  [
    "Stop Job",
    "You're done here. Asks for optional completion notes, then marks everything at the stop Completed and works out the hours.",
  ],
  [
    "Skip",
    "One service at this stop isn't getting done today — no access, weather, client not ready. Asks for a reason, which the office sees.",
  ],
];

export function CrewAppGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="The Crew App"
        description="What a crew sees on their phone — the day's stops, clocking on and off, breaks, photos, and sending work back to the office."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#signing-in">Signing in, and what a crew can see</TOCLink>
          <TOCLink href="#my-schedule">My Schedule — the day&apos;s stops</TOCLink>
          <TOCLink href="#materials-called-for">Materials called for</TOCLink>
          <TOCLink href="#drive-time">Drive time</TOCLink>
          <TOCLink href="#working-a-stop">Working a stop</TOCLink>
          <TOCLink href="#hours">How your hours are worked out</TOCLink>
          <TOCLink href="#notes-photos">Notes and photos</TOCLink>
          <TOCLink href="#suggest-work">Suggesting work you spot</TOCLink>
          <TOCLink href="#office-side">What the office sees</TOCLink>
        </div>
      </div>

      <Section id="signing-in" title="Signing in, and what a crew can see">
        <p>
          A crew signs in and lands on a home screen with three tiles: <strong>My Schedule</strong>,{" "}
          <strong>Dashboards</strong>, and <strong>Job Photos</strong>. That&apos;s the whole app for
          them — no clients list, no invoices, no estimates, and no sidebar full of office screens.
        </p>
        <p>
          It runs in the phone&apos;s browser, so there&apos;s nothing to install. Tell crews to add it to
          their home screen once and it behaves like an app from then on.
        </p>
        <Callout>
          <strong>The login belongs to the crew, not to a person.</strong> Create a user with the{" "}
          <strong>Crew</strong> role, then attach it under Team → Crews → <strong>Linked Login</strong>{" "}
          on that crew. A login can only be attached to one crew — once it&apos;s used, it stops
          appearing in the list for the others. That attachment is what decides whose stops get shown,
          and the app refuses to clock in or out on a stop belonging to a different crew. A crew login
          that isn&apos;t attached to any crew signs in to an empty schedule.
        </Callout>
        <p>
          Because the login is shared, the app records hours for the <strong>crew</strong> — see below.
          Individual people&apos;s times are handled by the office, not on the phone.
        </p>
        <p>
          Whether crews see prices is your choice: <strong>Hide pricing from crews</strong> under
          Landscapt Settings removes rates and amounts from everything they can reach. It&apos;s worth
          turning on if you&apos;d rather the crew not be drawn into a pricing conversation on a
          driveway.
        </p>
      </Section>

      <Section id="my-schedule" title="My Schedule — the day's stops">
        <p>
          <strong>My Schedule</strong> is the day&apos;s work as a list of <strong>stops</strong>, in
          route order. Each card shows the client, the address, the services due there, and a status.
        </p>
        <Callout>
          <strong>A stop is a property visit, not a job.</strong> If a client has three services due
          at the same address on the same day, that&apos;s <em>one</em> stop with three services on it —
          the crew drives there once, so they clock in once. This is why the buttons say Start Job and
          Stop Job rather than per-service ones: the clock belongs to the visit to the property.
        </Callout>
        <p>
          Tapping a card opens the stop: the address (tap it for directions), the client&apos;s phone
          (tap to call), any notes the office left, the list of services, the buttons below, and — when
          the office called for specific materials on the job — a <strong>Materials called for</strong>{" "}
          card (see below).
        </p>
      </Section>

      <Section id="materials-called-for" title="Materials called for">
        <p>
          When the office has planned specific products for a job (the <strong>Products</strong> section
          on the Job record, or on the dispatch board&apos;s job popup), the stop shows a{" "}
          <strong>Materials called for</strong> card listing each one with the quantity the office
          planned. This is separate from <strong>Request Materials</strong> below — it&apos;s not the
          crew asking for something, it&apos;s the crew confirming what was already ordered for them.
        </p>
        <p>For each material still pending, the crew can:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Confirm or edit the quantity</strong> and tap <strong>Mark Used</strong> — the
            field starts pre-filled with the planned quantity, but the crew can correct it if less (or
            more) actually went down. The planned quantity itself is never overwritten, only what
            actually got used.
          </li>
          <li>
            <strong>Not Used</strong> — the material wasn&apos;t needed at this stop after all.
          </li>
        </ul>
        <p>
          Once resolved, the row becomes read-only and shows what was recorded. The web crew stop page
          (for crews working from a browser tab instead of the app) has the identical card and does the
          same thing against the same underlying job — either side works from the same planned list.
        </p>
      </Section>

      <Section id="drive-time" title="Drive time">
        <p>
          Drive time is tracked for the <strong>day</strong>, not per stop — it covers the yard to the
          first job and everything between. Tap <strong>Start Drive</strong> when the truck moves and{" "}
          <strong>End Drive</strong> when it stops.
        </p>
        <p>
          You don&apos;t have to remember to end it: starting a job automatically closes an open drive
          segment, so a crew that drives off and taps Start Job at the next property gets the drive
          recorded correctly without a second thought. You also can&apos;t start drive time while a job
          is running — stop the job first.
        </p>
      </Section>

      <Section id="working-a-stop" title="Working a stop">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-4 py-2 text-left">Button</th>
              <th className="px-4 py-2 text-left">What it does</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STOP_ACTIONS.map(([label, what]) => (
              <tr key={label} className="border-t border-[#e6e6e0]">
                <td className="px-4 py-2 align-top font-semibold whitespace-nowrap">{label}</td>
                <td className="px-4 py-2 align-top">{what}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Start Job and Stop Job apply to the <strong>whole stop</strong>. Skip is the exception —
          it&apos;s per service, so a crew can skip the hedges and still complete the mow at the same
          property.
        </p>
        <Callout>
          If the office left <strong>notes for the crew</strong> on the job, the stop asks the crew to{" "}
          <strong>Acknowledge</strong> them — and <strong>Start Job is disabled until they do</strong>.
          It&apos;s not just a record that the note was read, it&apos;s a hard gate: a crew can&apos;t
          clock in on a stop with an unread &quot;gate code changed&quot; or &quot;dog in the back
          yard&quot; note. If the office edits the note after it was already acknowledged, the gate
          reopens — acknowledging again is what re-enables Start Job.
        </Callout>
      </Section>

      <Section id="hours" title="How your hours are worked out">
        <p>
          When a crew taps Stop Job, the hours for that stop are:
        </p>
        <p className="rounded-md border border-[#e6e6e0] bg-[#f7f7f4] px-4 py-3 font-mono text-sm">
          (clock out − clock in − break minutes) × number of crew members
        </p>
        <p>
          Those hours are then split across the services at the stop in proportion to their budgeted
          hours, so a stop with a two-hour cleanup and a half-hour mow doesn&apos;t credit them equally.
          That&apos;s what the office compares against budget on the dispatch board.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Breaks come off the total.</strong> Pausing for lunch and resuming subtracts those
            minutes. If a crew clocks out while still on a break, the break is closed at that moment
            and still subtracted — nobody gets billed for a break somebody forgot to end.
          </li>
          <li>
            <strong>Forgot to clock in?</strong> If there&apos;s no clock-in on the stop, the app falls
            back to the job&apos;s scheduled start time and the time you tapped Stop Job. It&apos;s an
            estimate, not a measurement — clocking in is what makes the number real.
          </li>
          <li>
            <strong>Overnight shifts work.</strong> A clock-out time earlier in the day than the start
            time is treated as the next day rather than as negative hours, which matters for storm
            work that runs past midnight.
          </li>
        </ul>
        <Callout>
          Hours are per <em>crew</em>, multiplied by headcount. Individual start and finish times —
          for someone who came late or left early — are entered by the office on the dispatch board,
          not by the crew on their phone. Those per-person times are what labour cost is calculated
          from.
        </Callout>
      </Section>

      <Section id="notes-photos" title="Notes and photos">
        <p>
          <strong>Notes to Office</strong> sends a message back from the field. It shows on the
          dispatch board against that stop, so it&apos;s the right place for &quot;couldn&apos;t reach the
          side bed, sprinkler running&quot; rather than a text message to somebody&apos;s phone.
        </p>
        <p>
          <strong>Add Photo</strong> takes a picture with the camera and attaches it to the visit.
          Before-and-afters, damage found on arrival, and anything a client might query later all
          belong here — they stay attached to the visit rather than living in someone&apos;s camera roll.
        </p>
      </Section>

      <Section id="suggest-work" title="Suggesting work you spot">
        <p>
          Crews are at the property every week and notice things the office never sees. The{" "}
          <strong>Suggest work</strong> button on a stop sends that back: pick the service from a
          short list, add a note, take a photo, send. It arrives as a ticket for the office to price
          and quote.
        </p>
        <p>
          The photo is the part that matters most — with one, the office can usually quote the work
          without driving out to look at it.
        </p>
        <Callout>
          <strong>Crews never see or set a price here</strong>, and the list is one you control: tick{" "}
          <strong>Show in field upsells</strong> on a service under Services &amp; Pricing, and give it
          a short prompt (&quot;Overgrown or blocking a walkway?&quot;) so crews know what to look for.
          With no services ticked, the Suggest work button doesn&apos;t appear at all — that&apos;s how the
          feature is switched on and off.
        </Callout>
        <p>
          The full round trip — what the office sees, converting one into an estimate, and the two
          reports that show whether suggestions turn into money — is in the{" "}
          <strong>Tickets</strong> guide under &quot;Field upsells from crews&quot;.
        </p>
      </Section>

      <Section id="office-side" title="What the office sees">
        <p>
          Everything a crew does lands on the <strong>Dispatch Board</strong> in real time: status
          moving to In Progress and Completed, actual hours against budgeted, notes, skip reasons, and
          photos. Nothing needs to be re-entered at the end of the day.
        </p>
        <p>
          Dashboards are scoped separately. A crew only sees dashboards that have been explicitly
          marked visible to crews, so you can give them a job-count or hours board without exposing
          revenue.
        </p>
        <p>
          For the office&apos;s half of this — stop order, route optimisation, and exactly how actual
          hours are compared against budget — see the <strong>Dispatch Board</strong> guide.
        </p>
      </Section>
    </DocsFontScope>
  );
}
