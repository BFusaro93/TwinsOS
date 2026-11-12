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
          <TOCLink href="#good-to-know">Good to know</TOCLink>
        </div>
      </div>

      <Section id="signing-in" title="Signing in, and what a crew can see">
        <p>
          A crew signs in and lands on a home screen with three tiles: <strong>My Schedule</strong>,{" "}
          <strong>Dashboards</strong>, and <strong>Job Photos</strong>. That&apos;s the whole app for
          them — no clients list, no invoices, no estimates, and no sidebar full of office screens.
        </p>
        <p>
          <strong>Spanish.</strong> The crew pages in the browser and the native app can be switched
          between English and Spanish with the <strong>Español / English</strong> link (it shows the
          language you would switch to). The choice is remembered on that device, and dates and month
          names follow the language. The Job Notes box on a stop has{" "}
          <strong>Translate to Spanish</strong> and <strong>Translate to English</strong> links
          underneath, whichever language the app itself is set to (the app&apos;s language only decides
          which link comes first). Tapping one shows the translation beneath the original note, which is
          never replaced and is labelled &quot;Translated automatically&quot;; a note already in that language
          says so. Each note is translated once per language and kept on the device. Only the Job Notes
          box is translated, not client or service names or comments.
        </p>
        <p>
          The native app has the same crew tools as the browser version: Start Day and End Day, Edit
          Crew (per-person attendance), Suggest Work, and Request Materials. A shared stop shows who the
          other crew is (&quot;With &hellip;&quot;), and tapping a push notification for a new job or a
          visit note opens that stop. &ldquo;Today&rdquo; is always the company&apos;s day (its time
          zone in Settings), checked every time the schedule loads and whenever the app comes back to
          the screen &mdash; a phone left open overnight, or set to another time zone, shows the
          right day&apos;s route.
        </p>
        <p>
          <strong>Office staff in the field.</strong> An owner or office employee doesn&apos;t need a
          separate crew login. When their own login is attached to a crew (Team → Crews → Linked
          Login, or automatically by ticking <strong>Schedule Jobs Directly</strong> on their
          employee record), the regular home screen shows a <strong>My Schedule</strong> tile on any
          day that crew has a visit &mdash; or a stop still clocked in from the last two days &mdash; and
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
          If an action is queued without signal (clock in/out, pause, resume, skip, drive start/end,
          Start Day, End Day, and marking someone in, out or not working), a banner
          says it&apos;s saved on the phone and will send when signal returns, and it is
          recorded at the moment it was tapped, not when the phone reconnects &mdash; so a lunch pause
          that syncs hours later still subtracts the right minutes, and a 7:00 Start Day that syncs at
          9:30 still pays from 7:00. Taps older than 48 hours, or from a clearly wrong phone clock,
          fall back to the sync time.
        </p>
        <Callout>
          <strong>The login belongs to the crew, not to a person.</strong> When you create a crew
          account under Settings → Users → <strong>Create Crew Account</strong>, Landscapt also
          creates a crew with the same team name and links the two. If you already have an unlinked
          crew with that name, the new login is attached to it instead of making a duplicate. You
          can change this any time under Team → Crews → <strong>Linked Login</strong> on that crew:
          pick a different login, or choose None to unlink. A login can only be attached to one
          crew — once it&apos;s used, it still appears in the list for the others but greyed out and
        labelled &quot;already on&quot; the crew that holds it. That attachment
          is what decides whose stops get shown, and the app refuses to clock in or out on a stop
          belonging to a different crew. A crew login that isn&apos;t attached to any crew (for
          example, one you unlinked, or created before this was automatic) signs in to a screen
          that says &quot;Your login isn&apos;t linked to a crew&quot; rather than a quiet day. Invited users
          who haven&apos;t accepted yet appear in the Linked Login list marked &quot;(invite pending)&quot;.
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
          Whether crews see service prices is your choice: <strong>Hide pricing from crews</strong>{" "}
          under Landscapt Settings removes them from everything they can reach. It&apos;s worth
          turning on if you&apos;d rather the crew not be drawn into a pricing conversation on a
          driveway. Job totals, labor and material costs, and material prices are never available
          to a crew login, whatever the setting — not in the app and not by reading the data
          directly with the crew&apos;s login.
        </p>
      </Section>

      <Section id="my-schedule" title="My Schedule — the day's stops">
        <p>
          <strong>My Schedule</strong> is the day&apos;s work as a list of <strong>stops</strong>, in
          route order. Each card shows the client, the address, the services due there, and a status.
          Tapping the card opens the stop; the map pin button beside the address opens directions in
          the phone&apos;s maps app.
        </p>
        <p>
          <strong>Equipment today</strong>, above the stops, lists the trucks, trailers and equipment
          the office put on the crew for the day on the Crew Board (or the crew&apos;s default
          equipment when nothing was changed for that day), so the crew knows what to take from the
          yard.
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
        <p>
          <strong>Snow jobs record materials per storm.</strong> On a snow stop the planned materials
          (salt, for example) come back as pending for every storm: record what you used on this
          storm, and the next storm starts fresh from the same plan. Each storm&apos;s usage is billed
          on that storm&apos;s invoice.
        </p>
        <p>
          <strong>Request Materials</strong> (in the native crew app and on the browser stop page,
          under a <strong>Materials requests</strong> card) is the crew asking for something instead. Pick a stocked or project material from the catalog, enter a quantity
          and an optional note, and Submit Request creates a draft requisition tied to that job for
          the office to review. The quantity can be fractional, up to two decimals (half a yard of
          mulch is 0.5); maintenance parts aren&apos;t available in field requests. The crew never
          sees prices on the request. Each request is listed under the card with its status:
          Submitted, Pending approval, Approved, Rejected, Ordered or Closed.
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
          progress the app asks you to confirm before ending the day; the job&apos;s time then stops
          when the day ended, even if Stop Job is only tapped the next morning, so the night is never
          counted as time on the job. Tap Stop Job on it when you can so it&apos;s completed and billed.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Who &quot;everyone&quot; is.</strong> The crew&apos;s roster for that date: the
            employees under Team → Crews → Team Assignments, adjusted by any same-day reassignment on
            the Crew Board, minus anyone marked not working and minus anyone whose
            Days on the Team Assignment don&apos;t include that weekday (an employee on one crew
            Mon&ndash;Wed and another Thu&ndash;Fri counts only on the crew they&apos;re scheduled
            with that day; a same-day reassignment always wins). Deactivated or terminated employees
            are never on a roster. A crew with nobody on its roster can&apos;t
            start a day &mdash; the button stays disabled, with a note underneath, until
            someone is added (tap <strong>Edit Crew</strong> to add the people working, or ask the office).
            A crew account created under Settings → Users starts with an empty roster, so add team
            members under Team → Crews first.
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
          <li>
            <strong>Started a job after End Day?</strong> Storm call-back, or End Day tapped by
            mistake: starting a job reopens that person&apos;s shift for the day, and the time between
            End Day and the new job start is taken off as an unpaid break, so the hours worked after
            End Day are paid and nothing is counted twice. Tapping Start Day on a day that has
            already ended does nothing; only starting a job reopens it.
          </li>
          <li>
            <strong>Working past midnight.</strong> A shift that started the evening before and is
            still running (storm work) stays one shift: after midnight the card reads{" "}
            <strong>Day started yesterday</strong> with an <strong>End Day</strong> button, a second
            Start Day isn&apos;t offered, and the first job after midnight doesn&apos;t open an
            overlapping shift. End Day closes it once. Until 6am, yesterday&apos;s unfinished stops
            also stay on the list, marked <strong>From yesterday</strong>, so a route that runs
            past midnight can be finished. A shift from the day before that started more than 12
            hours ago (a 3pm start nobody ended) is treated as forgotten, as is any shift open more
            than 16 hours: End Day doesn&apos;t close it at an absurd length, it stays open and the
            Payroll report flags it for the office to correct. Someone who left before midnight and
            comes back after it rejoins the shift they left, so the time away is only taken off
            once. If you export Payroll while some
            days are still open or have no shift, Landscapt warns that hours are understated or missing
            and asks you to confirm — fix those days first for accurate pay. An <strong>open</strong>{" "}
            day has a Start Day but no End Day; a <strong>no shift</strong> day has job time but no
            Start Day. The exported totals count both per employee in the <strong>Days to Review</strong>{" "}
            column, and each affected day is labelled OPEN SHIFT or NO SHIFT in the daily detail. The
            PDF export prints a separate table for each employee, with that person&apos;s days and a total
            row, after the totals-by-employee summary.
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
            and the time they were away is taken off as an unpaid break. If a job is still in
            progress, their earlier job punch reopens too with the time away taken off, so the hours
            they work on that job after returning are counted in job hours and Job Costing.
          </li>
        </ul>
        <p>
          <strong>Someone from another crew is helping today: Add someone to my crew today.</strong> At
          the bottom of Edit Crew, pick the person from the list and tap <strong>Add</strong>. The list
          shows people on the company&apos;s other crews who aren&apos;t already on yours today. They
          join your crew for today only (the same one-day move the dispatch board&apos;s Team
          Assignment makes), are clocked in like a late arrival, and join the running job&apos;s
          punches if a job is in progress. Tomorrow they are back on their usual crew. If they were
          already clocked in on a job with another crew, that job punch is closed at the moment you
          add them (their day shift keeps running), so their time is counted once — the same
          happens when the office moves them with Team Assignment on the dispatch board.
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
          <strong>Sub-items under a service.</strong> If the estimate&apos;s service had sub-items (the
          products to bring and the tasks to do), the stop lists them under that service with their
          quantities. Crews never see prices. They&apos;re for planning only and don&apos;t bill or
          change inventory. The office sees the same list under the service on the job.
        </p>
        <p>
          While a job is running, the timer shows how much of the stop&apos;s budgeted time is left (for
          example &ldquo;1h 05m left&rdquo;), turning red as &ldquo;over budget&rdquo; once it runs past. Break time doesn&apos;t
          count against it. A stop with no budgeted hours shows the plain elapsed time. When a crew stops a
          job, a <strong>Time summary</strong> shows each person&apos;s start and finish and the total crew
          time, so they can fix someone who arrived late or left early before tapping Done. A row can
          read 0m (a stop started and stopped in the same minute) and still be finished; a finish
          before the start can&apos;t.
        </p>
        <p>
          Start Job and Stop Job apply to the <strong>whole stop</strong>. Skip is the exception —
          it&apos;s per service, so a crew can skip the hedges and still complete the mow at the same
          property. A leftover visit on a job that is On Hold or Cancelled isn&apos;t on the crew&apos;s
          list, so Start Job and Stop Job skip it rather than starting, completing and invoicing work
          nobody asked for. A double tap, or a tap queued offline that replays later, is treated as
          already done instead of showing an error. If a crew taps Start Job on a stop that was already
          completed, skipped or cancelled, the app tells them its status instead of clocking in, and visits with no
          client clock in the same as any other. If the office marked a stop complete while the crew was still punched
          in, the crew&apos;s Clock Out closes those leftover punches so they don&apos;t stay open on the Timesheet. If a crew already started the stop (Start Job
          clocked them in) and then skips it, their clocks stop at the skip &mdash; as long as no
          other service at the same stop is still running &mdash; so the hours still reach the
          Timesheet and Job Costing instead of staying open. Those clocks stop at the moment Skip was
          tapped (or when the crew ended the day, if that came first), not when the phone next had signal.
        </p>
        <p>
          <strong>One job at a time.</strong> If the crew taps Start Job while another of its stops is
          still running (Stop Job was never tapped), the other stop&apos;s time is stopped
          automatically at the moment the new job starts (or when it was paused, if it was on a break),
          so nobody is clocked in on two jobs at once. The crew sees a message, the office sees a
          comment on that visit saying it was stopped automatically when the crew started the new
          stop, and the stop stays in progress until someone finishes it: open it and tap Stop Job
          (the photo and chemical checks still apply) or the office marks it complete. Its hours are
          the time up to when it was stopped. Only the crew&apos;s own stops are affected; another crew
          on a shared stop keeps running.
        </p>
        <p>
          <strong>Stop Job after the office already completed the stop.</strong> The crew&apos;s
          punches close at the moment Stop Job was tapped, and anything typed in the closing notes is
          kept on the visit &mdash; added to the office&apos;s completion notes if there are some.
        </p>
        <p>
          <strong>Changing a job&apos;s crew mid-day.</strong> A stop that a crew has already started
          stays with that crew when the office moves the job to another crew, so they can still pause,
          skip and stop it, and their time closes normally. Finished visits keep the crew that did
          them. Only the job&apos;s upcoming, not-yet-started visits move to the new crew.
        </p>
        <p>
          If the stop has chemicals, a <strong>Confirm chemicals applied</strong> card lists each one
          at its planned amount. Enter how much was actually used, or tick <strong>Not used</strong>,
          then tap <strong>Confirm chemicals</strong>. Confirming only works once the stop is running
          (the card says &quot;Start the job first&quot; until then), and it records the crew foreman as
          the applicator, with their applicator license, plus a matching mix volume when the amount
          changed. When the company requires crew confirmation,{" "}
          <strong>Stop Job stays disabled</strong> until every chemical is confirmed. Chemicals on a
          service the crew skipped (or the office cancelled) aren&apos;t listed to mix or confirm and
          never hold up Stop Job. If the crew starts a stop the office never dispatched, its
          chemicals are loaded at Start Job so the card, the confirmation and the stock deduction
          still work. Chemicals the office added to the stop before it started are part of the plan
          too and are confirmed the same way. If a planned chemical has no unit (nothing was
          estimated), pick the unit next to the amount before confirming. Confirming a chemical that
          another phone already confirmed simply skips it.
        </p>
        <p>
          <strong>Label, how applied, conditions and extra products.</strong> These work the same in the browser crew page and in the iOS and Android crew app. Each chemical has a{" "}
          <strong>View label</strong> link showing its EPA number, re-entry interval, whether it is
          restricted-use, and the label directions the office entered on the product. If a chemical
          has no planned amount (no area or application rate was on file), the card says so and the
          crew enters what they measured. <strong>How applied</strong> opens the method, target and area treated, starting from what the office planned; changing them saves the new values on the record when the chemical is confirmed. Under the list, <strong>Conditions</strong> takes the
          temperature and wind (and/or pH, depending on the company&apos;s Chemical Tracking
          setting). The temperature and wind are filled in from the National Weather Service reading nearest the
          property (tap <strong>Update</strong> to refresh it) and can be corrected; if no reading is
          available they are typed as before. They&apos;re optional and are saved on every chemical confirmed in that tap.{" "}
          <strong>Add a chemical</strong> records a product the office didn&apos;t preload, such as a
          spot treatment or a substitute: choose the product, the <strong>Concentrate used</strong>{" "}
          &mdash; the product itself before mixing, not the finished spray, so the unit starts on the
          product&apos;s own unit &mdash; and optionally how it was applied and the conditions (inside
          the confirm card it uses the conditions already entered there; on the iOS and Android app
          too). The product&apos;s application rate is kept on the record. A stop with no chemicals planned shows a small{" "}
          <strong>Chemicals</strong> card with the same button, as long as the company tracks at least
          one chemical product, so a crew can still record a treatment the office didn&apos;t plan.
          It is saved already confirmed, with the foreman as
          applicator, and counts toward the compliance report and stock like any other. When the
          office has filed a label or Safety Data Sheet for the product, <strong>View label</strong>{" "}
          also shows an <strong>Open</strong> button for it.
        </p>
        <p>
          <strong>Confirmed records are final for the crew.</strong> Once a chemical is confirmed,
          or once its visit is completed, skipped or cancelled, the crew can no longer change it: the
          confirmation is the record of what was applied and may already be on a Notice of
          Treatment. If something was entered wrong, the office corrects it from the visit&apos;s
          Chemical Applications panel, and the change is kept in the record&apos;s audit trail.
        </p>
        <p>
          <strong>Reference.</strong> The <strong>Reference</strong> button on the crew home screen
          (browser) or the top of the schedule (iOS/Android) opens the company&apos;s library of labels,
          Safety Data Sheets, SOPs and training. Search by title, filter by type, and tap a document to
          open it. Documents the office marked office-only don&apos;t appear, and opening one needs a
          connection.
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
          and chemicals are confirmed on the lead crew&apos;s stop. Materials and sub-items for the stop
          show on your stop too, so either crew can record what was used.
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
        <p>
          <strong>Time left on the running job.</strong> While a stop is running, its timer counts
          down from the stop&apos;s budget in clock time, not including breaks. Each visit on the stop
          adds its budget: the visit&apos;s own Budgeted Hours (set on the dispatch board, in
          man-hours) divided by the number of men on it, or otherwise the per-person budgeted hours of
          every service the visit covers. The web and phone apps work it out the same way.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Breaks come off the total.</strong> Pausing for lunch and resuming subtracts those
            minutes. If a crew clocks out while still on a break, the break is closed at that moment
            and still subtracted — nobody gets billed for a break somebody forgot to end. If the crew
            had already ended the day (End Day, or everyone clocked off) before that late Stop Job
            &mdash; say paused at 4pm, End Day at 5pm, Stop Job the next morning &mdash; the stop is
            closed at the end of the day instead, so the overnight isn&apos;t counted as a break
            against anyone&apos;s hours.
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
        <p>
          That formula is the starting estimate. When people have actually been clocked in on the stop
          (Start Job punches the crew in), the visit&apos;s hours follow the real punches instead:
          each person&apos;s own clock-in to clock-out, minus their breaks, added together — so
          someone who arrived late or left early is counted for exactly the time they were there. The
          stop&apos;s pause time comes off each person only up to the time they were on the job, so
          someone who joined after a lunch pause isn&apos;t docked for it. (The app records how long
          the stop was paused, not exactly when, so someone on the job for part of the visit can
          still be docked up to their own time there.) The
          crew-size multiplication is used only when there are no punches for the stop.
        </p>
        <p>
          <strong>Crew times only change through the app.</strong> Start Day, End Day, clocking
          people in and out and editing punches all go through the crew app&apos;s own checks; a crew
          login can&apos;t change shift or punch times any other way. Every change to a day shift,
          and every Payroll correction, is kept in the audit history.
        </p>
        <p>
          <strong>Locked pay periods.</strong> Once an admin locks payroll through a date (Report
          Center → Payroll), nothing dated on or before it can change &mdash; not from the crew app, the
          dispatch board or Payroll. A crew tap that lands in a locked day (for example a shift from
          before the lock that was never ended) is refused with &ldquo;Payroll is locked through
          &hellip;; ask an admin to move the lock date&rdquo;, and End Day leaves that one shift open
          for the office while still ending everyone else&apos;s day.
        </p>
        <p>
          <strong>Read-only accounts.</strong> When a company&apos;s subscription is canceled or its
          trial has ended, the crew app can still show the schedule, but Start Job, Stop Job, pauses,
          skips, photos, checklists, crew times and attendance are refused with a message instead of
          appearing to save. One exception: for the first 24 hours after the account becomes
          read-only, <strong>End Day</strong> still works, so a crew that was on the clock at that
          moment can close out its open shifts at the real time. Starting a new day or a new job is
          not allowed.
        </p>
        <p>
          <strong>Once a visit&apos;s invoice is sent, its punches are locked for crew.</strong> Stop
          Job usually puts the visit straight onto a <em>draft</em> invoice, and while that invoice is
          still a draft the crew can keep correcting member punches (Edit Crew, Time Summary). Once the
          invoice has been issued (printed, sent or paid, and not voided or deleted), the crew app
          refuses changes or deletions to member punches on that visit and tells you to ask the office
          to correct the time. The office can still edit times. Editing punches doesn&apos;t change the
          invoice amount: an auto-created invoice bills each service&apos;s quantity and rate, not the
          hours worked.
        </p>
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
          If your connection drops and the app resends the note, it is saved once, not twice. Each note
          shows who wrote it and when: &quot;You&quot; for the crew&apos;s own notes, &quot;Office&quot; and
          the person&apos;s name for remarks from the office.
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
          <strong>Add Photo</strong> takes a picture with the camera (or, in the phone app, picks one
          from the library) and attaches it to the visit.
          Before-and-afters, damage found on arrival, and anything a client might query later all
          belong here — they stay attached to the visit rather than living in someone&apos;s camera roll.
          If your company turned on <strong>Require a Before photo to start a job</strong> or{" "}
          <strong>Require an After photo to stop a job</strong> (Landscapt Settings, in the crew app
          section), the Photos area shows Before and After buttons, and Start Job or Stop Job stays disabled
          until a photo with that label is on the stop. A photo that is still uploading with no signal counts.
        </p>
        <p>
          Photos bigger than about 3 MB (typical for a recent phone camera) are shrunk on the phone
          before they upload (longest side 2,400 px, re-saved as a JPEG), so uploads don&apos;t fail
          on a weak connection; smaller photos go up untouched. If an upload fails you can pick the
          same photo again and retry.
        </p>
        <p>
          <strong>Required Before and After photos.</strong> When your company turns on
          &quot;Require Before photo&quot; and/or &quot;Require After photo&quot;, the Photos card shows a{" "}
          <strong>Before photo</strong> and an <strong>After photo</strong> button. Each one lets you
          take the picture or choose one already in your photo library, and tags it Before or After
          (a photo added with the plain Add Photo button doesn&apos;t count). Nothing stops you
          starting the job — both required photos are checked when you tap{" "}
          <strong>Stop Job</strong>, which stays disabled until they&apos;re on the stop. A photo still
          waiting to upload with no signal counts; the app uploads it before it sends the Stop Job.
          A photo whose upload failed doesn&apos;t count until you retry it.
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
          The day clock lands in <strong>Report Center → Payroll</strong> (admins, plus any role with the View &amp; Edit Payroll Report permission):
          each person&apos;s clock-in, clock-out, breaks and total hours per day, ready to correct and
          export for payroll.
        </p>
        <p>
          Dashboards are scoped separately. A crew only sees dashboards that have been explicitly
          marked visible to crews. Reports built on jobs and visits carry prices, so they show a
          crew login no data even on a crew-visible dashboard.
        </p>
        <p>
          For the office&apos;s half of this — stop order, route optimisation, and exactly how actual
          hours are compared against budget — see the <strong>Dispatch Board</strong> guide.
        </p>
      </Section>
      <Section id="good-to-know" title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Gate codes and property notes.</strong> The stop shows the property&apos;s gate or lock code in large type, and the property&apos;s crew notes count as notes to read before Start Job, the same as job notes. The stop lists each note once: the job note, then each service&apos;s own note, then the property&apos;s standing note (which now shows even when the job or a service has its own note). The crew only sees dispatched stops: a visit that is still Scheduled shows on the dispatch board but not on the crew&apos;s list until the office dispatches it (including a package step still waiting on the Waiting List).
          </li>
          <li>
            <strong>Full addresses.</strong> The stop page shows the full address, including state and zip, and wraps it rather than cutting it off. Map links use the full address too.
          </li>
          <li>
            <strong>Times in company time.</strong> Times on the crew screens are shown in the company&apos;s timezone, so a phone set to another zone still shows the right clock times.
          </li>
          <li>
            <strong>Signed out or no connection.</strong> If the crew&apos;s sign-in has expired, My Schedule and the stop page say so with a sign-in button. With no connection they say they couldn&apos;t load and offer Retry, instead of looking like there&apos;s no work.
          </li>
          <li>
            <strong>Finished stops.</strong> A stop the office cancels drops off the crew&apos;s list, unless the crew is still clocked in on it; then it stays, marked cancelled with no Start Job, until they clock out. A stop the crew forgot to stop stays on their list for up to two days after its date; after that it drops off and the office closes it from the Dispatch Board. Skipped and cancelled stops count as done in the day&apos;s progress, and an <strong>All stops done</strong> card reminds the crew to tap End Day.
          </li>
          <li>
            <strong>One-handed use.</strong> Start Job and Stop Job sit in a bar at the bottom of the screen, above the iPhone home bar, and small buttons are at least finger-sized. When a button is disabled, the reason shows under it.
          </li>
          <li>
            <strong>Empty roster.</strong> If no one is on the crew today, Edit Crew explains how to add people (Team → Crews in the office), and a login that isn&apos;t linked to a crew doesn&apos;t show Edit Crew.
          </li>
          <li>
            <strong>Photos.</strong> Photos for every service on the stop load together, so they show straight away after the page reloads.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
