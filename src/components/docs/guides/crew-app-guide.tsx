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
    "You're done here. Asks for optional completion notes, then marks everything at the stop Completed and works out the hours. The office reads the notes on the job's Visits tab and on the client's timeline.",
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

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#signing-in">Signing in, and what a crew can see</TOCLink>
          <TOCLink href="#my-schedule">My Schedule — the day&apos;s stops</TOCLink>
          <TOCLink href="#materials-called-for">Materials called for</TOCLink>
          <TOCLink href="#drive-time">Drive time</TOCLink>
          <TOCLink href="#crew-day">Start Day and End Day</TOCLink>
          <TOCLink href="#working-a-stop">Working a stop</TOCLink>
          <TOCLink href="#shared-stops">When another crew is on your stop</TOCLink>
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
          <strong>Office staff in the field.</strong> An owner or office employee doesn&apos;t need a
          separate crew login. When their own login is attached to a crew (Team → Crews → Linked
          Login, or automatically by ticking <strong>Schedule Jobs Directly</strong> on their
          employee record), the regular home screen shows a <strong>My Schedule</strong> tile on any
          day that crew has a visit &mdash; or a stop still clocked in from an earlier day &mdash; and
          hides it on days with nothing assigned.
        </p>
        <p>
          It runs in the phone&apos;s browser, so there&apos;s nothing to download from an app store.
          It&apos;s also an installable web app: have crews use the browser&apos;s{" "}
          <strong>Add to Home Screen</strong> (iPhone Safari) or <strong>Install app</strong>{" "}
          (Android Chrome) option once, and it opens full-screen from a home-screen icon like a
          normal app; the icon opens the login screen, and a phone that is still signed in goes straight to
          its home. (If an icon was added before this changed and opens the marketing page instead,
          remove it and add it again.) It still needs a signal to load and save — installing doesn&apos;t add offline
          use. Inputs are sized so iPhones don&apos;t zoom in when a field is tapped, and controls
          are larger for gloved or one-handed use.
        </p>
        <p>
          If an action is queued without signal (clock in/out, pause, resume, drive start/end), it is
          recorded at the moment it was tapped, not when the phone reconnects &mdash; so a lunch pause
          that syncs hours later still subtracts the right minutes. Taps older than 48 hours, or from
          a clearly wrong phone clock, fall back to the sync time.
        </p>
        <Callout>
          <strong>The login belongs to the crew, not to a person.</strong> When you create a crew
          account under Settings → Users → <strong>Create Crew Account</strong>, Landscapt also
          creates a crew with the same team name and links the two. If you already have an unlinked
          crew with that name, the new login is attached to it instead of making a duplicate. You
          can change this any time under Team → Crews → <strong>Linked Login</strong> on that crew:
          pick a different login, or choose None to unlink. A login can only be attached to one
          crew — once it&apos;s used, it stops appearing in the list for the others. That attachment
          is what decides whose stops get shown, and the app refuses to clock in or out on a stop
          belonging to a different crew. A crew login that isn&apos;t attached to any crew (for
          example, one you unlinked, or created before this was automatic) signs in to an empty
          schedule.
        </Callout>
        <p>
          <strong>A regular user can be a crew&apos;s Linked Login too.</strong> If someone who works
          a crew has their own login (a crew lead or owner, say), pick their name in Linked Login
          instead of creating a separate shared crew login for them. They sign in as themselves,
          keep their normal access, and find the crew&apos;s stops under{" "}
          <strong>Scheduling → My Crew Schedule</strong> in Landscapt (the link only appears for
          someone linked to a crew). It&apos;s the same Crew App screen, with the same clock-in and
          stop rules. Being listed under Team Assignments is separate: that puts someone on the
          crew&apos;s roster for scheduling and costing, but doesn&apos;t give them the Crew App.
        </p>
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

      <Section id="crew-day" title="Start Day and End Day">
        <p>
          The paid day runs <strong>shop to shop</strong>, not stop to stop. At the top of My
          Schedule the crew has a green <strong>Start Day</strong> button. One tap by whoever has the
          phone starts the day for <strong>everyone working on the crew</strong> that day; once it&apos;s
          running the card reads &quot;Day started 7:02 AM &mdash; 3 on the clock&quot; with an{" "}
          <strong>End Day</strong> button that clocks everyone out at once. If a job is still in
          progress the app asks you to confirm before ending the day.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Who &quot;everyone&quot; is.</strong> The crew&apos;s roster for that date: the
            employees under Team → Crews → Team Assignments, adjusted by any same-day reassignment on
            the Crew Board, minus anyone marked not working. A crew with nobody on its roster can&apos;t
            start a day &mdash; the button stays disabled until the office adds people.
          </li>
          <li>
            <strong>Forgot to tap Start Day?</strong> Starting the first job opens the day anyway, so
            payroll still has a shift. It&apos;s flagged <em>Started at first job</em> in the Payroll
            report, because the real start (at the shop) was earlier &mdash; the office can correct it
            there.
          </li>
          <li>
            <strong>Start Job and Stop Job clock the whole crew too.</strong> Start Job punches every
            working member in on that stop at the same moment and Stop Job punches them out. Those
            per-person job punches feed Job Costing; the Start Day / End Day shift feeds payroll. They
            are separate on purpose: drive time and shop time are paid but aren&apos;t on a job.
          </li>
          <li>
            <strong>The day is the company&apos;s day.</strong> Which calendar day a shift belongs
            to follows your organization&apos;s time zone, not the phone&apos;s.
          </li>
        </ul>
        <p>
          <strong>Late, out, or leaving early: Edit Crew.</strong> Tap <strong>Edit Crew</strong> on My
          Schedule for the roster with each person&apos;s in/out time. For each person:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Not working</strong> &mdash; out today (sick, vacation, hasn&apos;t shown). They are
            skipped by Start Day and Start Job, so they aren&apos;t clocked in by mistake.
          </li>
          <li>
            <strong>Clock In</strong> &mdash; arrived late. Their shift starts now, and if a job is in
            progress they join its punches from now.
          </li>
          <li>
            <strong>Left for the day</strong> &mdash; ends their shift and any open job punch, and
            marks them not working so the next Start Job doesn&apos;t clock them in again.
          </li>
          <li>
            <strong>Back</strong> &mdash; someone who left returns the same day. Their shift reopens
            and the time they were away is taken off as an unpaid break.
          </li>
        </ul>
        <p>
          <strong>Someone from another crew is helping today: Add someone to my crew today.</strong> At
          the bottom of Edit Crew, pick the person from the list and tap <strong>Add</strong>. The list
          shows people on the company&apos;s other crews who aren&apos;t already on yours today. They
          join your crew for today only (the same one-day move the dispatch board&apos;s Team
          Assignment makes), are clocked in like a late arrival, and join the running job&apos;s
          punches if a job is in progress. Tomorrow they are back on their usual crew.
        </p>
        <Callout>
          The day clock is for the <strong>crew leader&apos;s login</strong> &mdash; the crew login (or
          the regular user linked to the crew), and only for that crew&apos;s own roster. Office staff
          fix anything after the fact in <strong>Report Center → Payroll</strong> (see the Report Center
          guide) or with <strong>Edit Job Times</strong> on the dispatch board.
        </Callout>
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
              <tr key={label} className="border-t border-[#e6e6e0] dark:border-border">
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
        <p>
          If the stop has chemicals, a <strong>Confirm chemicals applied</strong> card lists each one
          at its planned amount. Enter how much was actually used, or tick <strong>Not used</strong>,
          then tap <strong>Confirm chemicals</strong>. When the company requires crew confirmation,{" "}
          <strong>Stop Job stays disabled</strong> until every chemical is confirmed.
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

      <Section id="shared-stops" title="When another crew is on your stop">
        <p>
          If the office put a second crew on the same stop, your stop card says{" "}
          <strong>With &lt;other crew&gt;</strong> and the stop screen shows who else is on site.
          You each have your own stop: tap <strong>Start Job</strong> and <strong>Stop Job</strong>
          for <em>your</em> crew, and your hours are worked out from your clock times and your
          headcount only. Nothing you do clocks the other crew in or out. The visit is billed once by
          the office from the lead crew&apos;s stop, so your stop doesn&apos;t create its own invoice,
          and chemicals are confirmed on the lead crew&apos;s stop.
        </p>
      </Section>

      <Section id="hours" title="How your hours are worked out">
        <p>
          When a crew taps Stop Job, the hours for that stop are:
        </p>
        <p className="rounded-md border border-[#e6e6e0] dark:border-border bg-[#f7f7f4] dark:bg-card px-4 py-3 font-mono text-sm">
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
          Hours on a stop are per <em>crew</em>, multiplied by headcount. Individual start and finish
          times for someone who came late or left early come from two places: the crew leader&apos;s{" "}
          <strong>Edit Crew</strong> button (see Start Day and End Day above), or the office in{" "}
          <strong>Edit Job Times</strong> on the dispatch board. Those per-person punches are what
          labour cost is calculated from. Pay is a different question: payroll uses the Start Day to
          End Day shift, not the on-job hours.
        </Callout>
      </Section>

      <Section id="notes-photos" title="Notes and photos">
        <p>
          <strong>Notes to Office</strong> sends a message back from the field. It shows on the
          dispatch board against that stop, so it&apos;s the right place for &quot;couldn&apos;t reach the
          side bed, sprinkler running&quot; rather than a text message to somebody&apos;s phone.
        </p>
        <p>
          <strong>Notes from the office.</strong> The job&apos;s crew note appears under{" "}
          <strong>Job Notes</strong> with its formatting (bold, bulleted and numbered lists), and you
          read and acknowledge it before clocking in. A note typed on a single visit is plain text.
          When the office adds or changes a visit note, your phone gets a &quot;Note from
          Dispatch&quot; notification only if that visit is dispatched, in progress, or scheduled
          within the next two days. A note on a visit further out is waiting on the stop when you get
          there, and you still have to acknowledge it before you can start.
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
          The day clock lands in <strong>Report Center → Payroll</strong> (admins and managers only):
          each person&apos;s clock-in, clock-out, breaks and total hours per day, ready to correct and
          export for payroll.
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
