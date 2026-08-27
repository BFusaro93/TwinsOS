import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Chip,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const CRM_TRIGGERS: [string, string][] = [
  ["New Client", "A client record is created."],
  ["New Lead", "A client is created with status “lead” (before they’ve converted)."],
  ["Lead Converted to Client", "A lead’s status changes to “active.”"],
  ["Client Cancelled", "A client’s status changes to “cancelled.”"],
  ["New Estimate", "An estimate is created."],
  ["Estimate Won", "An estimate’s stage changes to “won.”"],
  ["Estimate Lost", "An estimate’s stage changes to “lost.”"],
  ["New Job", "A job (recurring, one-time, snow, project, etc.) is created."],
  ["New Ticket", "A support/service ticket is created."],
  ["Ticket Closed", "A ticket’s status changes to “closed.”"],
  ["New Invoice", "An invoice is created."],
  ["Invoice Paid", "An invoice’s status changes to “paid.”"],
  ["Contract Signed", "A contract’s signed-date is set."],
  ["New Damage Case", "A damage case is logged."],
  ["Visit Dispatched", "A scheduled job visit is dispatched to a crew."],
];

const CMMS_TRIGGERS: [string, string, boolean][] = [
  ["New Asset", "An asset (vehicle, equipment) is added.", false],
  ["New Work Order", "A work order is created.", false],
  ["Work Order Completed", "A work order’s status changes to “done.”", true],
  ["New Requisition", "A purchase requisition is created.", false],
  ["New Purchase Order", "A PO is created.", false],
  ["PO Approved", "A PO’s status changes to “approved.”", true],
  ["PM Schedule Due", "A preventive-maintenance schedule’s next-due date has passed, and it’s still active.", false],
  ["Part Low Stock", "A part’s quantity on hand drops to or below its minimum stock level.", false],
  ["New Vendor", "A vendor is added.", false],
  ["Meter Threshold", "A tracked meter crosses a value you choose — see below.", false],
];

const ACTIONS: [string, string, string, string][] = [
  ["Create Client", "A new client (Landscapt)", "Display Name", "First/Last Name, Email, Phone, Account Type, Source, Service Address/City/State/Zip"],
  ["Create Job", "A scheduled job (Landscapt)", "Client", "Job Type, Scheduled Date, Notes"],
  ["Create Ticket", "A support ticket, attached to a client", "Client, Subject", "Body, Priority, Category, Type, Due Date"],
  ["Add Note to Client", "An entry on a client’s activity timeline", "Client, Note text", "Subject"],
  ["Create Work Order", "An Equipt work order", "Title", "Asset, Description, Priority, Type, Due Date"],
  ["Create Requisition", "An Equipt purchase requisition (starts as a draft)", "Title", "Vendor, linked Work Order, Notes"],
];

export default function ZapierGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Integrations"
        title="Connecting Zapier"
        description="Every trigger, every action, and exactly what fires each one."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#connecting">Connecting</TOCLink>
          <TOCLink href="#how-triggers-work">How triggers work</TOCLink>
          <TOCLink href="#crm-triggers">Landscapt (CRM) triggers</TOCLink>
          <TOCLink href="#cmms-triggers">Equipt triggers</TOCLink>
          <TOCLink href="#meter-threshold">Meter Threshold, in detail</TOCLink>
          <TOCLink href="#actions">Actions</TOCLink>
          <TOCLink href="#open-questions">Not yet supported</TOCLink>
        </div>
      </div>

      <Section id="connecting" title="Connecting">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to <strong>Master Account Settings → Integrations</strong>. Not Equipt Settings or
            Landscapt Settings — the connection is account-wide and works whether or not your plan
            includes Equipt.
          </li>
          <li>
            Click <strong>Generate Key</strong>. Copy the key shown — it&apos;s displayed once, in
            full, and never again.
          </li>
          <li>
            In Zapier, when connecting the Equipt/Landscapt app, paste that key into the API Key
            field.
          </li>
          <li>
            Clicking <strong>Regenerate</strong> at any time invalidates the old key immediately —
            any Zaps still using it will need to be reconnected with the new one.
          </li>
        </ol>
        <Callout>
          <strong>Whose data does a Zap see?</strong> The key is tied to your organization, not an
          individual user. Anything a Zap does happens as your org, scoped only to your org&apos;s
          own records.
        </Callout>
      </Section>

      <Section id="how-triggers-work" title="How triggers work">
        <p>Two delivery methods. You don&apos;t choose — Zapier handles it automatically.</p>
        <Table>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="w-32 px-3 py-2 align-top"><Chip instant /></td>
              <td className="px-3 py-2 text-[#4a4a46]">
                The moment the event happens inside Equipt or Landscapt, we push it straight to
                Zapier&apos;s webhook URL. Most triggers work this way.
              </td>
            </tr>
            <tr>
              <td className="w-32 px-3 py-2 align-top"><Chip instant={false} /></td>
              <td className="px-3 py-2 text-[#4a4a46]">
                Zapier calls our API every few minutes to check for new matching records. This also
                powers the &quot;Test&quot; step when setting up any Zap, and is the <em>only</em>{" "}
                method for a few triggers with no natural &quot;moment it happened&quot; to hook into.
              </td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <Section id="crm-triggers" title="Landscapt (CRM) triggers">
        <p>
          All instant — these piggyback on the same internal event dispatch that runs Landscapt&apos;s
          own automations feature, so a Zap fires at the same moment an internal automation would.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Fires when&hellip;</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {CRM_TRIGGERS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="cmms-triggers" title="Equipt triggers">
        <p>
          Equipt has no single internal &quot;event happened&quot; dispatcher the way Landscapt does —
          most Equipt mutations write straight to the database from the browser. So most of this list
          is polling-only, and two get instant delivery because they already round-trip through a
          server route for an unrelated reason: Equipt&apos;s own internal automations feature.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Fires when&hellip;</th>
              <th className="w-24 px-3 py-2">Delivery</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {CMMS_TRIGGERS.map(([name, desc, instant]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
                <td className="px-3 py-2"><Chip instant={instant} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          Polling just means the Zap checks in every few minutes instead of firing the instant the
          event happens — for low stock, PM due, or a new vendor, that gap rarely matters. If instant
          delivery for more of these matters for your workflow, ask — most just need a small addition
          on our end.
        </Callout>
      </Section>

      <Section id="meter-threshold" title="Meter Threshold, in detail">
        <p>
          Equipt tracks &quot;meters&quot; per asset — engine hours on a mower, odometer miles on a
          truck, whatever a piece of equipment accrues over time. This trigger lets a Zap fire when one
          of those values crosses a number you pick. You set three things when you build the Zap:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Which meter</strong> — pick a specific meter, or leave it blank to check every meter in your org.</li>
          <li><strong>Threshold</strong> — the number to compare against.</li>
          <li><strong>Direction</strong> — &quot;at least&quot; (the default) or &quot;at most.&quot;</li>
        </ul>
        <Callout>
          <strong>Example.</strong> &quot;Truck #4&apos;s odometer reaches 50,000 miles&quot; → meter =
          Truck #4 — Odometer, threshold = 50000, direction = at least. Every poll, Zapier checks the
          meter&apos;s current value against that line; the moment it crosses, the Zap fires.
        </Callout>
        <p>
          This is separate from any meter-threshold automations already configured inside Equipt
          itself — those run their own actions (create a work order, send a notification) and
          aren&apos;t affected by anything set up in Zapier. Leaving the threshold off entirely just
          lists current meter values — that&apos;s what powers Zapier&apos;s &quot;test this
          trigger&quot; step before you&apos;ve picked a number.
        </p>
      </Section>

      <Section id="actions" title="Actions">
        <p>
          What a Zap can create in Equipt or Landscapt. Every field an ID points at — client, vendor,
          work order, asset — is checked against your org before anything is written.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Creates</th>
              <th className="px-3 py-2">Required</th>
              <th className="px-3 py-2">Optional</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {ACTIONS.map(([name, creates, required, optional]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{creates}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{required}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{optional}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="open-questions" title="Not yet supported">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Custom fields</strong> — actions only accept the fields listed above. Need
            something else set when a Zap creates a record — a custom field, a specific GL code? Ask
            and it can be added.
          </li>
          <li>
            <strong>Update actions</strong> — Zaps can only create new records today, not update
            existing ones (e.g. &quot;update ticket status from a Zap&quot;).
          </li>
          <li>
            <strong>More instant triggers</strong> — a few of the Equipt polling triggers could become
            instant with a small change, if the delay matters for a particular workflow.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
