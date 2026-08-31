import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const MEETING_STATUSES: [string, string][] = [
  ["Scheduled", "The default state for a newly booked meeting. Shown in brand color on the calendar."],
  ["Completed", "The meeting happened. Set from the meeting's status dropdown after the fact — nothing advances it automatically."],
  ["Canceled", "The meeting was called off. Shown struck through on the calendar, and excluded from the double-booking check."],
  ["No Show", "The client/lead didn't show. Purely informational — doesn't affect reminders or automations."],
];

const MEETING_FIELDS: [string, string][] = [
  ["Sales Rep *", "Required. Only employees flagged as a sales rep (and active) appear in this list."],
  ["Client / Lead Name", "Either pick an existing client, or leave it unset and type a free-text lead name for a prospect who isn't in the system yet. A meeting can't have both — picking a client hides the lead-name field."],
  ["Title *", "Free text, e.g. \"Estimate walkthrough\"."],
  ["Meeting Type", "In Person, Phone, or Video — label only, doesn't change any behavior."],
  ["Date / Time / Duration *", "Duration is in minutes (5-minute increments). Together with the start time, this defines the window used for the double-booking check."],
  ["Location", "Free text — an address or a video-call link, whichever fits the meeting type."],
  ["Link to Estimate / Link to Ticket", "Only shown once a client is picked. Each is scoped to that client's own estimates/tickets."],
  ["Notes", "Free text, staff-only."],
];

export default function SalesMeetingsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Sales Meetings"
        description="Booking appointments per sales rep, the double-booking warning, and the split between a rep's direct reminder and the client-facing automation trigger."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where">Where it is</TOCLink>
          <TOCLink href="#sales-reps">Sales reps: who shows up on the calendar</TOCLink>
          <TOCLink href="#calendar-views">Day, Week, and Month views</TOCLink>
          <TOCLink href="#booking">Booking and editing a meeting</TOCLink>
          <TOCLink href="#double-booking">The double-booking warning</TOCLink>
          <TOCLink href="#status">Meeting status</TOCLink>
          <TOCLink href="#reminders">Reminders: rep vs. client</TOCLink>
          <TOCLink href="#reschedule">Rescheduling and the reminder reset</TOCLink>
          <TOCLink href="#see-also">See also</TOCLink>
        </div>
      </div>

      <Section id="where" title="Where it is">
        <p>
          <strong>CRM → Sales Meetings.</strong> The page is a single calendar, one column per sales
          rep, that a manager or the reps themselves use to book and track sales appointments —
          estimate walkthroughs, follow-up calls, video demos — separately from the operational
          Dispatch Board, which only ever shows service visits.
        </p>
      </Section>

      <Section id="sales-reps" title="Sales reps: who shows up on the calendar">
        <p>
          The calendar only ever shows employees explicitly flagged as a sales rep. That flag lives
          on the employee record, not on their user role — mark someone as a sales rep (and confirm
          they're marked active) in <strong>Team → Employees</strong> before they'll appear as a
          column here. If no employee is flagged yet, the page shows a message pointing you to that
          same setting instead of an empty calendar.
        </p>
        <Callout>
          A rep's color on the calendar is the same map-icon color assigned to them elsewhere in the
          app (e.g. the Dispatch Board), so a rep who's already color-coded there will look
          consistent here too.
        </Callout>
      </Section>

      <Section id="calendar-views" title="Day, Week, and Month views">
        <p>
          Three view modes, switched with the toggle next to the date picker:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Day</strong> — one column per rep, hours 7 AM–7 PM down the side. Meetings are
            positioned and sized by their actual start time and duration. Click any empty slot to
            book a meeting for that rep at that hour.
          </li>
          <li>
            <strong>Week</strong> — one row per rep, one column per day (Sun–Sat). Each cell lists
            every meeting that rep has that day, time-sorted. Click an empty part of a cell to book
            for that rep on that day.
          </li>
          <li>
            <strong>Month</strong> — a standard 6-week grid (no rep breakdown). Each day shows up to
            3 meetings before collapsing into a "+N more" — click a day to jump straight into Day
            view for it.
          </li>
        </ul>
        <p>
          Whichever view is active, its date range is exactly what gets fetched — Day view queries a
          single day, Week the visible Sun–Sat span, Month the full 42-cell grid — so switching
          views doesn't pull the whole calendar's history into memory at once.
        </p>
      </Section>

      <Section id="booking" title="Booking and editing a meeting">
        <p>
          Clicking <strong>Book Meeting</strong> (or an empty calendar slot) opens the same dialog
          used for editing — the only difference is whether a meeting was passed in. Clicking an
          existing meeting opens it pre-filled for editing, including a <strong>Cancel Meeting</strong>{" "}
          action (a soft delete — canceled meetings still show on the calendar, struck through, until
          they age out of view).
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Notes</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {MEETING_FIELDS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="double-booking" title="The double-booking warning">
        <p>
          Right before saving, the dialog checks whether the picked sales rep already has another{" "}
          <em>non-canceled</em> meeting whose time window overlaps the one you just set — same rep,
          overlapping start/end times, computed from each meeting's start time plus its duration.
          The check is scoped to just the picked day, so it stays a light query rather than
          re-fetching the whole calendar on every keystroke.
        </p>
        <Callout>
          <strong>This is a warning, not a block.</strong> If a conflict is found, you still see a
          toast naming the conflicting meeting and its time — but the save goes through regardless.
          This mirrors the same-class overlap warning on the Dispatch Board: sales reps sometimes
          deliberately double-book (a quick call squeezed into a longer walkthrough), so the app
          flags it for a second look instead of refusing to save.
        </Callout>
        <p>
          Editing a meeting excludes that same meeting from its own conflict check — moving a
          meeting 15 minutes later won't falsely warn that it conflicts with itself.
        </p>
      </Section>

      <Section id="status" title="Meeting status">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {MEETING_STATUSES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="reminders" title="Reminders: rep vs. client">
        <p>
          Two independent things happen 60 minutes before a scheduled meeting, run by a background
          job every 15 minutes:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>The rep's own reminder — always fires.</strong> The assigned sales rep gets an
            in-app notification and an email (each can be turned off individually in{" "}
            <strong>Settings → Notifications</strong>) regardless of whether the meeting has a
            client, a lead, or any automation configured. A rep should always know their day is
            coming up.
          </li>
          <li>
            <strong>The client-facing automation trigger — opt-in, client-only.</strong> If the
            meeting has a linked client, a <strong>Sales Meeting → Meeting is coming up</strong>{" "}
            trigger becomes available in the Automations builder. Build a sequence on that trigger
            to send the client their own reminder email or text. It only fires within that
            automation's own configured lead time (in minutes), which doesn't have to match the
            rep's fixed 60-minute window. A meeting with no client — a new-lead meeting — can't be
            enrolled in this automation at all, since Automations is entirely client-scoped; the rep
            still gets notified directly either way.
          </li>
        </ol>
        <Callout>
          Both paths dedupe against the same 15-minute cadence so a meeting doesn't get re-notified
          on every tick within its reminder window — see the reschedule note below for the one case
          that intentionally re-arms it.
        </Callout>
      </Section>

      <Section id="reschedule" title="Rescheduling and the reminder reset">
        <p>
          Once a meeting's reminder has fired, it's marked so the background job won't send it
          again. If you then <strong>change the date or time</strong>, that mark is cleared so the
          reminder can fire again for the new time. Editing anything else on an already-reminded
          meeting — notes, title, the linked estimate — leaves the mark alone, so a reminder that
          already went out for the correct time doesn't get needlessly resent just because someone
          added a note.
        </p>
      </Section>

      <Section id="see-also" title="See also">
        <p>
          Meetings created here can link to an existing estimate for the same client — see the{" "}
          <strong>Estimates &amp; the Budget Engine</strong> guide for how an estimate itself is
          built and priced. For the client-facing reminder sequence itself, see the{" "}
          <strong>Communication Automations</strong> guide for how triggers, sequences, and
          enrollment generally work.
        </p>
      </Section>
    </DocsFontScope>
  );
}
