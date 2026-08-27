import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const PAIRED_EVENTS: [string, string][] = [
  ["Work order assigned", "You're set as the assignee on a work order."],
  ["Work order status changed", "A work order you're watching changes status."],
  ["Work order overdue", "A work order passes its due date without being closed."],
  ["Work order comment", "Someone comments on a work order you're involved with."],
  ["Requisition approved", "A requisition you submitted is approved."],
  ["Requisition rejected", "A requisition you submitted is rejected."],
  ["Approval required", "You're the next approver in a requisition's approval chain."],
  ["PO approval required", "You're the next approver in a purchase order's approval chain."],
  ["Estimate approval required", "You're the next approver in an estimate's internal approval chain."],
  ["Estimate client-accepted", "A client accepts an estimate."],
  ["Estimate client-rejected", "A client declines an estimate."],
  ["New ticket", "A new support/service ticket comes in."],
  ["Ticket assigned", "You're set as the assignee on a ticket."],
  ["Ticket comment", "Someone comments on a ticket you're involved with."],
  ["Contract expiring", "A contract is approaching its expiration date."],
  ["Low stock alert", "A part's quantity on hand drops to or below its minimum."],
  ["PM schedule due", "A preventive-maintenance schedule's next-due date has passed."],
  ["New maintenance request", "A new maintenance request is submitted."],
];

const EMAIL_ONLY_EVENTS: [string, string][] = [
  ["Estimate approved", "An estimate you submitted for internal approval is approved."],
  ["Estimate rejected", "An estimate you submitted for internal approval is rejected."],
  ["Estimate expiring soon", "An estimate is approaching its expiration date."],
  ["Any WO created (admin)", "Org-wide firehose: any work order is created, not just your own."],
  ["Any WO status changed (admin)", "Org-wide firehose: any work order changes status."],
  ["Any WO comment (admin)", "Org-wide firehose: a comment is added to any work order."],
];

export default function NotificationPreferencesGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Administration"
        title="Notification Preferences"
        description="How email and in-app notifications are configured, where the defaults come from, and how the bell keeps read state in sync."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where">Where preferences live</TOCLink>
          <TOCLink href="#two-toggles">Email vs. in-app — two independent toggles</TOCLink>
          <TOCLink href="#event-reference">Full event reference</TOCLink>
          <TOCLink href="#defaults">Why defaults live in code, not a database row</TOCLink>
          <TOCLink href="#preferences-vs-recipients">Personal preferences vs. eligible recipients</TOCLink>
          <TOCLink href="#bell">How the bell decides what to show</TOCLink>
          <TOCLink href="#read-state">Real-time read-state sync</TOCLink>
        </div>
      </div>

      <Section id="where" title="Where preferences live">
        <p>
          Personal notification preferences are configured from <strong>Settings → Notifications</strong>{" "}
          (<code>NotificationsPage</code>). Every toggle on that screen reads and writes a single jsonb
          column: <code>profiles.notification_prefs</code>. There is one row per user — preferences are
          personal, not shared at the org level.
        </p>
        <p>
          The bell icon in the top nav (<code>NotificationsBell</code>) is the other half of the system —
          it decides what actually gets surfaced in-app based on the <code>inApp*</code> toggles below,
          while a separate server-side path handles the <code>email*</code> toggles for outbound email.
        </p>
      </Section>

      <Section id="two-toggles" title="Email vs. in-app — two independent toggles">
        <p>
          For most events there isn&apos;t one on/off switch — there are two, and they don&apos;t move
          together. You can get an email for &quot;work order assigned&quot; but turn off the in-app
          notification for it, or the reverse. Each is a separate boolean field on{" "}
          <code>NotificationPrefs</code> (e.g. <code>emailWorkOrderAssigned</code> and{" "}
          <code>inAppWorkOrderAssigned</code>), and the Settings UI renders them as two separate
          checkboxes per event row.
        </p>
        <p>That pairing isn&apos;t universal, though — a handful of events only exist on one channel:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Estimate change-request is in-app only.</strong> There is no{" "}
            <code>emailEstimateChangeRequest</code> field at all — this event can only ever produce a bell
            notification, never an email.
          </li>
          <li>
            <strong>Estimate approved, estimate rejected, and estimate expiring soon are email only.</strong>{" "}
            There&apos;s no in-app counterpart for any of the three — they don&apos;t show up in the bell,
            only in your inbox.
          </li>
          <li>
            <strong>The three admin &quot;any WO&quot; events are email only</strong> — see below.
          </li>
        </ul>
      </Section>

      <Section id="event-reference" title="Full event reference">
        <p>
          18 events support both channels independently. The remaining 7 are locked to a single channel —
          marked below.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">In-app</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {PAIRED_EVENTS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                  {name}
                  <div className="mt-0.5 whitespace-normal text-xs font-normal text-[#7a7a76]">{desc}</div>
                </td>
                <td className="px-3 py-2 text-[#4a4a46]">Yes</td>
                <td className="px-3 py-2 text-[#4a4a46]">Yes</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="bg-[#f4f6f0] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#5a5a56]">
                Estimate change-request — in-app only
              </td>
            </tr>
            <tr className="border-b border-[#eceae3] align-top">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                Estimate change-request
                <div className="mt-0.5 whitespace-normal text-xs font-normal text-[#7a7a76]">
                  A client (or internal reviewer) requests changes to an estimate before deciding.
                </div>
              </td>
              <td className="px-3 py-2 text-[#7a7a76]">No email variant</td>
              <td className="px-3 py-2 text-[#4a4a46]">Yes</td>
            </tr>
            <tr>
              <td colSpan={3} className="bg-[#f4f6f0] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#5a5a56]">
                Email only — no in-app counterpart
              </td>
            </tr>
            {EMAIL_ONLY_EVENTS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                  {name}
                  <div className="mt-0.5 whitespace-normal text-xs font-normal text-[#7a7a76]">{desc}</div>
                </td>
                <td className="px-3 py-2 text-[#4a4a46]">Yes</td>
                <td className="px-3 py-2 text-[#7a7a76]">Not shown in bell</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>The three &quot;admin&quot; rows are org-wide firehoses, not personal events.</strong>{" "}
          &quot;Any WO created,&quot; &quot;any WO status changed,&quot; and &quot;any WO comment&quot; fire
          for <em>every</em> work order in the org, not just ones you&apos;re assigned to or watching —
          they exist for admins who want full visibility, and are shown only to admin users in Settings.
          Off by default, since most admins don&apos;t want a copy of every single work order event in
          their inbox.
        </Callout>
      </Section>

      <Section id="defaults" title="Why defaults live in code, not a database row">
        <p>
          There&apos;s no org-wide &quot;default preferences&quot; row anywhere in the database. Defaults
          are a plain object in code — <code>DEFAULT_NOTIFICATION_PREFS</code> in{" "}
          <code>use-notification-prefs.ts</code> — and each user&apos;s actual saved preferences live in{" "}
          <code>profiles.notification_prefs</code>, a jsonb column that defaults to <code>{"{}"}</code> on
          a brand-new profile.
        </p>
        <p>
          What the app actually uses is the two merged together: code defaults, overlaid with whatever the
          user has explicitly changed. A brand-new user has stored nothing, so they simply get the
          hardcoded defaults. The moment they flip one toggle, only <em>that</em> field gets written to
          their row — everything else stays absent, still falling through to the code default.
        </p>
        <Callout>
          <strong>Why bother with this instead of seeding a row per user?</strong> Because it makes shipping
          a new default safe. If a future update changes a code default — say, turning &quot;PM schedule
          due&quot; email on by default for new users — that change only affects users who never touched
          that field. Anyone who already made a deliberate choice keeps it, because their choice is the
          only thing actually stored. If defaults were seeded as real rows at signup, changing a default
          later would either require a bulk migration or would silently do nothing for existing users —
          and there&apos;d be no way to tell &quot;user explicitly turned this off&quot; apart from &quot;user
          never had an opinion.&quot; Storing only deltas keeps that distinction intact for free.
        </Callout>
      </Section>

      <Section id="preferences-vs-recipients" title="Personal preferences vs. eligible recipients">
        <p>
          These are two different questions and it&apos;s easy to conflate them:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>&quot;What do I get?&quot;</strong> — your personal <code>notification_prefs</code>,
            covered above. This is entirely per-user and has no bearing on anyone else.
          </li>
          <li>
            <strong>&quot;Who in the org can even be notified?&quot;</strong> — a separate, admin-only
            setting for exactly two broadcast-style CRM events: <em>estimate decisions</em> (client accepts
            or declines) and <em>new tickets</em>. An admin uses the Recipients picker in Settings →
            Notifications to restrict the eligible pool for each, stored as an array of user IDs under{" "}
            <code>organizations.customizations</code> (<code>estimateDecisionRecipientIds</code> /{" "}
            <code>newTicketRecipientIds</code>). Leaving it unset means &quot;no restriction&quot; — anyone
            in the org is eligible.
          </li>
        </ul>
        <p>
          The two layers stack: the recipient pool decides who is <em>eligible</em> to be notified about
          an estimate decision or a new ticket org-wide; each eligible person&apos;s own{" "}
          <code>inAppEstimateClientAccepted</code> / <code>emailNewTicket</code> (etc.) toggle still decides
          whether they actually get it. Narrowing the pool doesn&apos;t override anyone&apos;s personal
          toggle, and turning your personal toggle on doesn&apos;t add you to the pool if an admin has
          excluded you.
        </p>
        <Callout>
          Two exceptions always ride along regardless of the picker: the estimate&apos;s sales rep is
          always included for estimate-decision notifications, and the ticket&apos;s assignee (if any) is
          always included for new-ticket notifications — on top of whoever is picked in the Recipients
          list.
        </Callout>
      </Section>

      <Section id="bell" title="How the bell decides what to show">
        <p>
          The bell isn&apos;t backed by a live push feed for the events themselves. Every time it renders,
          it derives the current notification list client-side from TanStack Query data that&apos;s already
          loaded in the app for other reasons — work orders, parts, PM schedules, requisitions, purchase
          orders, estimates, maintenance requests — filtered against your <code>inApp*</code> preferences,
          plus a one-time fetch of any persisted rows from a <code>notifications</code> table.
        </p>
        <p>
          There&apos;s no category or grouping UI — it&apos;s a single flat list, sorted unread items first
          and then by recency.
        </p>
      </Section>

      <Section id="read-state" title="Real-time read-state sync">
        <p>
          Read/unread state is the one part of this system that <em>is</em> genuinely real-time. A
          dedicated hook, <code>useNotificationReads</code>, subscribes to Supabase Realtime{" "}
          <code>postgres_changes</code> INSERT events on a <code>notification_reads</code> table, backed by
          both <code>localStorage</code> and that table.
        </p>
        <p>
          On load, read state is seeded instantly from <code>localStorage</code> (no flicker), then merged
          with rows fetched from Supabase. From then on, marking something read writes to both places, and
          the Realtime subscription pushes any read made elsewhere — another tab, another device — into
          this session live.
        </p>
        <Callout>
          <strong>If a notification shows read on one device but not another for a moment</strong> —
          that&apos;s the Realtime subscription catching up, not a bug. It resolves itself within the
          subscription&apos;s normal delivery time; there&apos;s no manual refresh needed.
        </Callout>
      </Section>
    </DocsFontScope>
  );
}
