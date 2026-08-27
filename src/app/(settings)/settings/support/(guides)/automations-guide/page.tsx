import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const TRIGGER_GROUPS: [string, string][] = [
  [
    "Client / Lead",
    "Client created, Client cancelled, Client reactivated, Client source updated, Lead created, Lead cancelled, Lead converted to client, Client referred a new lead/client, Credit card charge failed, Credit card about to expire, Credit card updated, Has opted in for emails, Payment method updated",
  ],
  ["Contract", "Contract created, Contract signed, Contract about to expire"],
  ["Damage Case", "Damage case created"],
  [
    "Estimate",
    "Estimate created, Estimate sent, Estimate won, Estimate lost, Estimate expiring, No response from client",
  ],
  ["Form", "Form submitted"],
  ["Invoice", "Invoice created, Invoice sent, Invoice past due, Invoice paid"],
  [
    "Job / Visit",
    "Job created, Job cancelled, Package created, Visit completed, Visit completed for a specific service, Visit cancelled, Visit dispatched, Visit skipped, Visit date changed, Visit moved to waiting list",
  ],
  ["Tag", "Tag added, Tag removed"],
  ["Ticket", "Ticket created, Ticket closed, Ticket past due, Ticket reopened"],
];

const EVENT_TYPES: [string, string][] = [
  ["Wait", "Pauses the sequence for a set number of days, hours, and minutes before the next event runs."],
  [
    "Email",
    "Sends an email from a chosen sender to the client's primary email, billing email, and/or all contacts marked ok-to-email. Subject and body support merge tags and can pull from a saved document template.",
  ],
  [
    "Text Message",
    "Sends an SMS to the client. Can require manual approval before sending, same as email.",
  ],
  [
    "Alert",
    "Posts an in-app alert (Info, Warning, or Urgent) to one or more chosen users — for internal heads-up, not client-facing.",
  ],
  [
    "Ticket",
    "Creates a support ticket with a title, description, priority (Low, Normal, High, Urgent), and an assignee.",
  ],
  [
    "If / Branch",
    "Checks one or more conditions against the client/job/estimate record. Events nested under the branch only run when every condition is met — everyone else skips the block and continues past it in the sequence.",
  ],
  ["Note", "Adds a note to the client's activity timeline."],
  [
    "Update a field",
    "Writes a value onto the client record: sales person, client source, billing term (Due on Receipt, Net 10/15/30/45/60/90), or a custom field.",
  ],
  ["Tags", "Adds and/or removes one or more tags on the client."],
];

const STOP_VS_TRIGGER: [string, string, string][] = [
  [
    "Trigger Conditions",
    "Attached to the trigger itself",
    "Extra AND-joined checks that must all be true for the trigger to fire in the first place. With none set, the sequence fires on every occurrence of the trigger event.",
  ],
  [
    "Stop Conditions",
    "Attached to the sequence",
    "OR-joined checks evaluated before each event runs. If any one is met, the sequence stops before that next event — the client simply exits the sequence. With none set, the sequence always runs to completion.",
  ],
];

export default function AutomationsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt / CRM"
        title="Communication Automations"
        description="How sequences, triggers, and events work — and how Automations differ from Sales Campaigns."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">Overview</TOCLink>
          <TOCLink href="#triggers">Triggers</TOCLink>
          <TOCLink href="#conditions">Trigger Conditions vs. Stop Conditions</TOCLink>
          <TOCLink href="#events">Events</TOCLink>
          <TOCLink href="#worked-example">Worked example: New Lead sequence</TOCLink>
          <TOCLink href="#email-windows">Email send windows &amp; approval</TOCLink>
          <TOCLink href="#automations-vs-campaigns">Automations vs. Sales Campaigns</TOCLink>
          <TOCLink href="#faq">FAQ</TOCLink>
        </div>
      </div>

      <Section id="overview" title="Overview">
        <p>
          An <strong>automation</strong> holds one or more <strong>Sequences</strong>. Each sequence
          has:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>One or more <strong>Triggers</strong> — the events that start a client on the sequence.</li>
          <li>Optional <strong>Trigger Conditions</strong> — narrow which occurrences of a trigger count.</li>
          <li>Optional <strong>Stop Conditions</strong> — end the sequence early for a given client.</li>
          <li>An ordered list of <strong>Events</strong> — what actually happens, in order, once a client enrolls.</li>
        </ul>
        <p>
          This is Landscapt&apos;s own internal automations engine — distinct from Equipt CMMS&apos;s
          meter-threshold and PM-schedule automations, and distinct from Zapier (see{" "}
          <a href="/settings/support/zapier-guide" className="text-[#60ab45] hover:underline">
            the Zapier guide
          </a>
          ).
        </p>
      </Section>

      <Section id="triggers" title="Triggers">
        <p>
          Every sequence starts from one or more triggers, grouped by the record type they fire on.
          Some triggers add an inline filter — for example &quot;Visit completed&quot; can be scoped to
          a specific service, &quot;Job created&quot; to a specific job type, or &quot;Estimate
          expiring&quot; to a specific number of days out.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Triggers</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {TRIGGER_GROUPS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Form submissions route into automations through the <strong>Form submitted</strong> trigger —
          see the dedicated{" "}
          <a href="/settings/support/forms-guide" className="text-[#60ab45] hover:underline">
            Forms guide
          </a>{" "}
          for how forms are built and published; this page doesn&apos;t re-cover that.
        </p>
      </Section>

      <Section id="conditions" title="Trigger Conditions vs. Stop Conditions">
        <p>Both are easy to mix up because they look identical to build — a list of field/operator/value rows — but they apply at different points and combine differently.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Lives on</th>
              <th className="px-3 py-2">Behavior</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STOP_VS_TRIGGER.map(([name, scope, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{scope}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Why Stop Conditions matter.</strong> A sequence can run over days or weeks (Wait
          events add real delay). If a client cancels, a lead converts, or a ticket gets closed
          partway through, you usually don&apos;t want the rest of the sequence to keep firing — a
          follow-up text reminding a now-cancelled lead to book, for instance. A Stop Condition such as
          &quot;Client status = cancelled&quot; ends the sequence for that client before the next event
          runs, without affecting anyone else still in progress.
        </Callout>
      </Section>

      <Section id="events" title="Events">
        <p>Events run top-to-bottom in the order you arrange them on the sequence canvas.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">What it does</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {EVENT_TYPES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="worked-example" title="Worked example: New Lead sequence">
        <p>
          A common pattern — greet a new lead, then follow up differently depending on whether they&apos;ve
          received an estimate yet:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Trigger:</strong> Lead was created.
          </li>
          <li>
            <strong>Wait</strong> — 1 day.
          </li>
          <li>
            <strong>Email</strong> — a welcome email from the assigned sales rep, sent to the client&apos;s
            primary email, restricted to weekday send hours.
          </li>
          <li>
            <strong>If / Branch</strong> — condition: has an estimate been sent?
            <ul className="list-disc space-y-1 pl-5 mt-2">
              <li>
                <strong>If true</strong> — nothing nested here; the client falls through to whatever
                comes after the branch.
              </li>
              <li>
                <strong>If false</strong> (nested under the branch) — <strong>Wait</strong> 2 more days,
                then <strong>Text Message</strong> — a short nudge asking if they&apos;d like an estimate.
              </li>
            </ul>
          </li>
          <li>
            <strong>Tags</strong> — add the tag &quot;Lead Nurture Sent&quot; so reporting and other
            automations can see this lead already went through the sequence.
          </li>
        </ol>
        <p>
          A <strong>Stop Condition</strong> of &quot;Lead cancelled&quot; on the sequence means that if
          the lead is marked cancelled at any point — say, right after the welcome email but before the
          branch — the text-message nudge never fires.
        </p>
      </Section>

      <Section id="email-windows" title="Email send windows & approval">
        <p>Every Email event has three settings beyond the subject/body/recipients:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Send Mon&ndash;Fri only</strong> — skips weekends; if the event would otherwise fire
            on a Saturday or Sunday, it waits until the next weekday.
          </li>
          <li>
            <strong>Send Between</strong> — a start and end time window (defaults to 8:00 AM&ndash;6:00
            PM); the email only goes out inside that window.
          </li>
          <li>
            <strong>Require approval before sending</strong> — holds the email in a pending state for a
            person to review and release, instead of sending automatically.
          </li>
        </ul>
      </Section>

      <Section id="automations-vs-campaigns" title="Automations vs. Sales Campaigns">
        <p>
          These two features look related but serve different jobs — don&apos;t reach for one when you
          mean the other.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">Automations (Sequences)</th>
              <th className="px-3 py-2">Sales Campaigns</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">Trigger</td>
              <td className="px-3 py-2 text-[#4a4a46]">An event on an individual client/job/estimate/ticket record</td>
              <td className="px-3 py-2 text-[#4a4a46]">You send it manually to a segment, once (or scheduled)</td>
            </tr>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">Audience</td>
              <td className="px-3 py-2 text-[#4a4a46]">One client at a time, as they hit the trigger</td>
              <td className="px-3 py-2 text-[#4a4a46]">A segment: All Clients, Active Clients, Leads, Past Clients, or a custom list</td>
            </tr>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">Channel</td>
              <td className="px-3 py-2 text-[#4a4a46]">Email, text, alerts, tickets, notes, field updates, tags</td>
              <td className="px-3 py-2 text-[#4a4a46]">Email, SMS, or postcard blast</td>
            </tr>
            <tr>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">Status / tracking</td>
              <td className="px-3 py-2 text-[#4a4a46]">Ongoing, evaluated continuously as records change</td>
              <td className="px-3 py-2 text-[#4a4a46]">Draft, Scheduled, Sending, Active, Paused, Completed, Cancelled — tracks delivered, opened, clicked, unsubscribed</td>
            </tr>
          </tbody>
        </Table>
        <p>
          Use an automation for &quot;when X happens to this client, do Y.&quot; Use a Sales Campaign for
          &quot;send this blast to everyone in this list right now.&quot;
        </p>
      </Section>

      <Section id="faq" title="FAQ">
        <p>
          <strong>Can an automation email send itself before anyone reviews it?</strong> Only if
          &quot;Require approval before sending&quot; is off for that email event. Turn it on to hold the
          email for manual approval before it sends — useful when you&apos;re not fully confident in a
          new automation yet.
        </p>
        <Callout>
          CRM Zapier triggers and CRM automation triggers fire off the same underlying internal event
          dispatch — see{" "}
          <a href="/settings/support/zapier-guide#crm-triggers" className="text-[#60ab45] hover:underline">
            the Zapier guide&apos;s CRM triggers section
          </a>{" "}
          if you&apos;re also wiring up Zapier alongside an internal automation on the same event.
        </Callout>
      </Section>
    </DocsFontScope>
  );
}
