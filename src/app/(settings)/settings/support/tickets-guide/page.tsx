import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const STATUSES: [string, string, string][] = [
  ["Open", "open", "Default status on every new ticket — including every ticket a public form creates."],
  ["On Hold", "on_hold", "Waiting on something outside your control (a callback, a part, a client reply). Counts as the same “Open” stage on the status flow indicator."],
  ["Pending", "pending", "Being actively worked — the middle step on the status flow (“In Progress”)."],
  ["Closed", "closed", "Resolved. Sets closed_at and fires the Ticket Closed trigger (Zapier + internal automations)."],
];

const PRIORITIES: [string, string][] = [
  ["Low", "Shown with no badge in the list view — only High and Urgent get a colored pill."],
  ["Normal", "The default on every new ticket, including form-created ones."],
  ["High", "Orange badge in the list."],
  ["Urgent", "Red badge in the list."],
];

const TYPES: [string, string][] = [
  ["Note", "The default type — a written ticket. What Forms always create."],
  ["Call", "Same record shape, filtered into a dedicated Calls list (typeFilter=\"call\") elsewhere in the app."],
  ["Event", "Same record shape, filtered into an Events list (typeFilter=\"event\")."],
];

const AUTOMATION_EVENTS: [string, string][] = [
  ["Ticket was created", "Fires when any ticket is created with a client attached — includes form-created tickets, since submit-form-response.ts links the ticket to the matched/created client."],
  ["Ticket was closed", "Fires when a ticket's status changes to closed, from useCloseTicket or a bulk “Mark Closed” action."],
  ["Ticket was reopened", "Fires when an update changes status away from \"closed\" to anything else — i.e. the ticket's prior status was closed."],
  ["Ticket past due", "Not a moment-it-happened event — evaluated against due_date via the ticket_past_due_days condition field (days since due date)."],
];

const NOTIFICATIONS: [string, string, string][] = [
  ["New Ticket", "inAppNewTicket / emailNewTicket", "Sent to the org's configured “New Ticket Recipients” plus the resolved assignee (if any), excluding whoever created the ticket. Also fires for anonymous form submissions (no creator to exclude)."],
  ["Ticket Assigned", "inAppTicketAssigned / emailTicketAssigned", "Sent only to the newly-assigned user — skipped if they assigned it to themselves."],
  ["Ticket Comment", "inAppTicketComment / emailTicketComment", "Sent only to the resolved assignee — skipped if the assignee is the one commenting."],
];

export default function TicketsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt / CRM"
        title="Tickets"
        description="Support and service tickets — where they come from, how they're worked, and how they connect to the rest of a client's record."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">What a ticket is</TOCLink>
          <TOCLink href="#not-maintenance-requests">Not the same as CMMS Maintenance Requests</TOCLink>
          <TOCLink href="#status-priority">Status, priority &amp; type reference</TOCLink>
          <TOCLink href="#creating">Creating a ticket</TOCLink>
          <TOCLink href="#assignment">Assignment</TOCLink>
          <TOCLink href="#lifecycle">Worked example: a form-to-close lifecycle</TOCLink>
          <TOCLink href="#detail-sheet">The ticket detail sheet</TOCLink>
          <TOCLink href="#client-link">Client link &amp; activity timeline</TOCLink>
          <TOCLink href="#automations-integrations">Automations, Zapier &amp; notifications</TOCLink>
        </div>
      </div>

      <Section id="overview" title="What a ticket is">
        <p>
          A ticket (<code>crm_tickets</code>) is Landscapt&apos;s general-purpose customer-service
          record — a note, call, or event tied to a client that needs to be tracked, assigned, and
          resolved. Every ticket has a sequential <code>ticket_number</code>, a status, a priority, an
          optional category, and an optional client and assignee.
        </p>
        <p>
          Tickets are shown as three different lists in the app — Tickets, Calls, and Events — but
          they&apos;re all the same underlying table and component (
          <code>TicketsList</code>, <code>src/components/crm/tickets/TicketsList.tsx</code>), just
          filtered by <code>type</code> (<code>note</code> / <code>call</code> / <code>event</code>).
        </p>
      </Section>

      <Section id="not-maintenance-requests" title="Not the same as CMMS Maintenance Requests">
        <Callout>
          <strong>Tickets</strong> (this page) are Landscapt/CRM&apos;s customer-service record — a
          client asks something, reports something, or needs a callback. <strong>Maintenance
          Requests</strong> are a separate, module-specific Equipt/CMMS concept (
          <code>src/components/cmms/RequestListPanel.tsx</code>, <code>RequestDetailPanel.tsx</code>,{" "}
          <code>NewRequestDialog.tsx</code>) for reporting an asset or equipment problem that may
          become a Work Order. They live in different tables, have different fields, and are not
          interchangeable — a client complaint is a Ticket; a broken mower is a Maintenance Request.
        </Callout>
      </Section>

      <Section id="status-priority" title="Status, priority &amp; type reference">
        <p>
          Values come from <code>src/types/crm-tickets.ts</code>. These are literal string enums, not
          free text — the UI (<code>TicketsList.tsx</code>, <code>TicketDetailSheet.tsx</code>) only
          ever writes one of these.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATUSES.map(([label, value, desc]) => (
              <tr key={value} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{label}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#4a4a46]">{value}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          The detail sheet&apos;s status flow indicator only shows three visual steps — Open, In
          Progress, Closed — because <code>on_hold</code> maps to the same step index as{" "}
          <code>open</code> (<code>TICKET_STATUS_INDEX</code> in{" "}
          <code>TicketDetailSheet.tsx</code>). Under the hood it&apos;s still a distinct, filterable
          status.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Table>
            <thead>
              <TableHeadRow>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Notes</th>
              </TableHeadRow>
            </thead>
            <tbody>
              {PRIORITIES.map(([label, desc]) => (
                <tr key={label} className="border-b border-[#eceae3] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{label}</td>
                  <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Table>
            <thead>
              <TableHeadRow>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Notes</th>
              </TableHeadRow>
            </thead>
            <tbody>
              {TYPES.map(([label, desc]) => (
                <tr key={label} className="border-b border-[#eceae3] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{label}</td>
                  <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p>
          <strong>Category</strong> is a free-form org-configured list (<code>crm_list_options</code>{" "}
          under key <code>ticket_categories</code>), not a hard-coded enum. If your org hasn&apos;t
          configured any, the New Ticket dialog and edit form fall back to a default set: Uncategorized,
          Estimate, Billing, Change Service, Complaint, Other.
        </p>
      </Section>

      <Section id="creating" title="Creating a ticket">
        <p>Three ways a ticket comes into existence:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Staff, manually</strong> — the <strong>Add Ticket</strong> (or Add Call / Add
            Event, depending on which list you&apos;re on) button opens{" "}
            <code>NewTicketDialog</code>, letting staff set type, client, category, subject, body,
            status, priority, assignee, and due date directly.
          </li>
          <li>
            <strong>A public form submission, automatically</strong> — every submission on a{" "}
            <code>crm_forms</code> form creates a ticket, no matter what else the form does or how it
            handles the matched/created client (<code>src/lib/forms/submit-form-response.ts</code>,{" "}
            around line 606). The ticket always starts as <code>status: &quot;open&quot;</code>,{" "}
            <code>priority: &quot;normal&quot;</code>, <code>type: &quot;note&quot;</code>, with{" "}
            <code>category</code> set to the form&apos;s own name and the body built from the
            submitter&apos;s name/email/phone/message plus every raw field on the form.
          </li>
          <li>
            <strong>A Communication Automation Event action</strong> — the Ticket action step (
            <code>TicketEventDialog.tsx</code>) lets an automation sequence create a ticket with a
            configurable title, description, priority (Low/Normal/High/Urgent), and assignee whenever
            it runs.
          </li>
        </ol>
        <p>Bulk creation is also available via CSV import (Actions menu → Import), which requires only a Subject column.</p>
      </Section>

      <Section id="assignment" title="Assignment">
        <p>
          A ticket can be assigned to exactly one user at a time, via <code>assigned_to</code> (a
          display-name string) and <code>assigned_to_id</code> (a real <code>profiles.id</code>,
          resolved from the assignee-picker&apos;s selected employee). Both are set together whenever
          the UI&apos;s Assigned To dropdown is used — in the New Ticket dialog, the edit form, or the
          list&apos;s bulk <strong>Reassign</strong> action (select one or more rows → Actions →
          Reassign).
        </p>
        <Callout>
          Tickets created before <code>assigned_to_id</code> existed, or created through a path that
          never had a real user id (the public form path always leaves the assignee blank; the Zapier
          &quot;Create Ticket&quot; action has no assignee field either), only have the name string.{" "}
          <code>resolveAssigneeId()</code> in <code>src/lib/ticket-notify.ts</code> falls back to
          fuzzy-matching that name against <code>crm_employees</code> so assignment notifications
          still work — but if the name doesn&apos;t match an employee exactly, assignment
          notifications are silently skipped rather than failing.
        </Callout>
      </Section>

      <Section id="lifecycle" title="Worked example: a form-to-close lifecycle">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            A visitor submits a contact form on your public site. <code>submitFormResponse()</code>{" "}
            matches or creates a client, then unconditionally inserts a <code>crm_tickets</code> row:
            open, normal priority, type note, category = the form&apos;s name, body = name/email/phone/
            message plus every raw field.
          </li>
          <li>
            <code>notifyStaffOfNewTicket()</code> runs immediately — it notifies the org&apos;s
            configured New Ticket recipients (no assignee yet, so no one else is added).
          </li>
          <li>
            Because the ticket has a client, <code>ticket_created</code> fires for any Communication
            Automation sequence watching that trigger (optionally filtered to this form&apos;s
            category), and for any Zapier &quot;New Ticket&quot; trigger.
          </li>
          <li>
            A manager opens the ticket from the Tickets list, clicks Reassign (or edits the ticket
            directly) and assigns it to a rep. This sets both <code>assigned_to</code> and{" "}
            <code>assigned_to_id</code>, and fires a <code>ticket_assigned</code> notification to that
            rep alone.
          </li>
          <li>
            The rep works the ticket — adds comments (Comments &amp; History tab, backed by{" "}
            <code>CommentsSection</code>), which notify the assignee if someone else comments, and
            sets status to <strong>Pending</strong> while they investigate.
          </li>
          <li>
            The rep resolves it and clicks <strong>Close Ticket</strong> (<code>useCloseTicket</code>).
            This sets <code>status: &quot;closed&quot;</code> and <code>closed_at</code>, then fires{" "}
            <code>ticket_closed</code> for both internal automations and Zapier.
          </li>
          <li>
            If the client later replies and staff change the status away from{" "}
            <strong>Closed</strong>, <code>useUpdateTicket</code> detects the prior status was closed
            and fires <code>ticket_reopened</code>.
          </li>
        </ol>
      </Section>

      <Section id="detail-sheet" title="The ticket detail sheet">
        <p>
          Clicking any ticket row opens <code>TicketDetailSheet</code>, with five tabs:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Details</strong> — status flow buttons, the client/category/assignee/dates meta grid, body text, and a Linked Records picker that can attach the ticket to an Estimate, Invoice, or Job belonging to the same client.</li>
          <li><strong>Comments &amp; History</strong> — threaded comments via the shared <code>CommentsSection</code> (<code>recordType=&quot;ticket&quot;</code>).</li>
          <li><strong>Files</strong> — attachments via the shared <code>AttachmentsSection</code>.</li>
          <li><strong>Contributors</strong> — additional staff CC&apos;d on the ticket as participants, distinct from the single assignee. Managed by <code>use-ticket-contributors.ts</code>.</li>
          <li><strong>Audit Trail</strong> — the shared <code>AuditTrailTab</code> change history.</li>
        </ul>
        <p>
          The header also has a <strong>PDF</strong> button that opens a print-formatted view in a new
          window — all ticket fields are HTML-escaped before being written into that window, since
          subject/body/names can originate from an unsanitized public form submission.
        </p>
      </Section>

      <Section id="client-link" title="Client link &amp; activity timeline">
        <p>
          <code>client_id</code> is nullable — a ticket doesn&apos;t strictly require a client — but
          whenever one is set at creation, <code>useCreateTicket</code> also inserts a matching{" "}
          <code>client_activity</code> row (<code>activity_type: &quot;ticket&quot;</code>) so the
          ticket shows up on that client&apos;s unified Activity Timeline alongside notes, calls,
          invoices, and estimates.
        </p>
        <p>
          A ticket created from a <strong>public form</strong> submission doesn&apos;t go through{" "}
          <code>useCreateTicket</code> — it&apos;s a direct server-side insert in{" "}
          <code>submit-form-response.ts</code> — but it logs the same shape of{" "}
          <code>client_activity</code> row (<code>activity_type: &quot;ticket&quot;</code>,
          linked via <code>ref_id</code>/<code>ref_table</code>), so it shows up and deep-links on
          the timeline exactly like a manually-created ticket does.
        </p>
        <p>
          A ticket can also carry an SMS-consent warning: if a form submission checked SMS consent but
          captured no phone number, <code>sms_consent_pending_phone</code> is set true and the detail
          sheet shows a dismissible amber banner until a phone number is collected and the warning is
          cleared.
        </p>
      </Section>

      <Section id="automations-integrations" title="Automations, Zapier &amp; notifications">
        <p>Communication Automations can trigger on four ticket events:</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Fires when&hellip;</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {AUTOMATION_EVENTS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          The same events are exposed to Zapier as instant triggers — <strong>New Ticket</strong> and{" "}
          <strong>Ticket Closed</strong> — and Zapier can also create tickets via the{" "}
          <strong>Create Ticket</strong> action (requires Client + Subject; accepts Body, Priority,
          Category, Type, and Due Date). See the{" "}
          <a href="/settings/support/zapier-guide" className="text-[#60ab45] hover:underline">
            Zapier guide
          </a>{" "}
          for the full trigger/action reference.
        </p>
        <p>Three notification preferences exist per user, each with separate email and in-app toggles:</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Preference</th>
              <th className="px-3 py-2">Keys</th>
              <th className="px-3 py-2">Who receives it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {NOTIFICATIONS.map(([name, keys, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#4a4a46]">{keys}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </DocsFontScope>
  );
}
