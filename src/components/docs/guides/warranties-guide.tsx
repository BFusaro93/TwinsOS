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

const STATE_ROWS: [string, string][] = [
  ["Not started", "Added to a project that isn't complete yet. No dates until the project is marked complete."],
  ["Active", "Has a start and an end date and today falls inside them."],
  ["Expiring soon", "Active, ending within 90 days."],
  ["Expired", "The end date has passed. Kept for the record, and claims can still be looked up against it."],
  ["Void", "Cancelled on purpose. Never counts as coverage."],
];

export function WarrantiesGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Warranties"
        description="Tracking the warranties you give on walls, walkways, patios and renovations — when each starts and ends, what it covers, and how warranty claims tie back to it."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">What a warranty is</TOCLink>
          <TOCLink href="#types">Warranty types</TOCLink>
          <TOCLink href="#adding">Adding a warranty</TOCLink>
          <TOCLink href="#clock">When the clock starts</TOCLink>
          <TOCLink href="#states">Status</TOCLink>
          <TOCLink href="#renew">Renewing and voiding</TOCLink>
          <TOCLink href="#claims">Warranty claims</TOCLink>
          <TOCLink href="#reminders">Expiry reminders</TOCLink>
          <TOCLink href="#permissions">Permissions</TOCLink>
        </div>
      </div>

      <Section id="overview" title="What a warranty is">
        <p>
          A warranty belongs to a client and, optionally, to the project or job it covers. It records a
          name, a coverage note, a length in months, a start and end date, and an optional cap on the
          damages it covers. You&apos;ll find them on the <strong>Warranties</strong> tab of a client,
          project or job, and all together on the <strong>Warranties</strong> page in the Scheduling
          menu (search, and filter by status).
        </p>
      </Section>

      <Section id="types" title="Warranty types">
        <p>
          On the Warranties page, <strong>Types</strong> lets you define the warranties you offer —
          for example &quot;Retaining wall — 60 months&quot; or &quot;Paver walkway — 24 months&quot;. Picking a
          type when adding a warranty fills in its length and default coverage wording. You can still
          change either on the warranty itself, and deleting a type never changes warranties already
          created from it.
        </p>
      </Section>

      <Section id="adding" title="Adding a warranty">
        <p>
          Click <strong>Add warranty</strong> on a client, project or job (or on the Warranties page and
          pick the client). Choose a type or enter a custom one, set the length, and the expiry date is
          calculated for you. The end date is the day before the anniversary: a 12-month warranty
          starting March 15 covers through March 14 of the next year.
        </p>
      </Section>

      <Section id="clock" title="When the clock starts">
        <p>
          On a project that isn&apos;t finished, leave the start date blank. The warranty is created as{" "}
          <strong>Not started</strong> and begins automatically the day the project is marked{" "}
          <strong>Complete</strong>, running for its full length from that date. On a project that&apos;s
          already complete, or on a client or job, the start date defaults to today and you can change it.
          A <strong>Start now</strong> button on a Not started warranty begins it immediately.
        </p>
      </Section>

      <Section id="states" title="Status">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATE_ROWS.map(([state, meaning]) => (
              <tr key={state} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{state}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="renew" title="Renewing and voiding">
        <p>
          <strong>Renew</strong> creates a new warranty of the same length. If the old one hasn&apos;t
          ended yet, the new one starts the day after it ends so there&apos;s no gap and no overlap; if
          it has ended, it starts today. The old warranty is kept as history.{" "}
          <strong>Void</strong> removes a warranty from coverage without deleting it, and{" "}
          <strong>Delete</strong> removes it from the lists entirely.
        </p>
      </Section>

      <Section id="claims" title="Warranty claims">
        <p>
          When you open a <GuideLink href="/settings/support/damage-cases-guide" className="text-[#60ab45] underline">Damage Case</GuideLink>{" "}
          with type <em>Warranty</em>, a <strong>Warranty</strong> picker lists your active warranties.
          Choosing one fills in the customer and checks the date of the incident against its coverage:
          if the incident falls outside the start and end dates you get a warning, and the case header
          later shows &quot;incident covered&quot; or &quot;incident outside coverage&quot;.
        </p>
        <p>
          The warranty then shows how many claims have been made against it and how much those claims
          have cost, next to its &quot;damages covered&quot; cap if you set one.
        </p>
        <Callout>
          The picker is a convenience, not a gate — a case can still be opened for an incident outside
          the warranty window. Decide on goodwill repairs case by case.
        </Callout>
      </Section>

      <Section id="reminders" title="Expiry reminders">
        <p>
          Each morning, any active warranty ending within 30 days triggers one reminder per end date:
          an in-app notification and an email to the client&apos;s sales rep, so they can offer a
          renewal. If the client has no sales rep, or the rep has left or can&apos;t be reached,
          organization admins get the in-app notification and the email instead, so the reminder is
          never dropped. Canceled organizations get no automated reminders.
          Turn either channel off under <strong>Settings → Notifications → Warranty Expiring Soon</strong>.
          Renewing a warranty gives it a new end date, which re-arms the reminder.
        </p>
      </Section>

      <Section id="permissions" title="Permissions">
        <p>
          <strong>View Warranties</strong> shows the tabs and the Warranties page;{" "}
          <strong>Add/Edit/Void Warranties</strong> allows changing them and managing types. Both are
          set per role in Settings → Roles under Scheduling.
        </p>
      </Section>
    </DocsFontScope>
  );
}
