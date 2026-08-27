import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const NEW_CASE_FIELDS: [string, string, string][] = [
  ["Case Type", "Required", "“Damage” or “Warranty” — a two-value select, defaults to Damage."],
  ["Date of Incident", "Required", "Date picker."],
  ["Customer / Property Name", "Required", "Free-text field, not a client picker — see the limitation below."],
  ["Property Address", "Optional", "Free-text."],
  ["Description", "Required", "Textarea. Placeholder copy changes with the selected Case Type."],
  ["Resolution Notes", "Edit only", "Only shown once a case exists — not on initial creation."],
];

const STATUS_ROWS: [string, string][] = [
  ["Open", "Default status on every new case."],
  ["In Progress", "Being worked — no system-enforced meaning beyond the label."],
  ["Resolved", "Has a dedicated color in the shared StatusBadge palette (teal)."],
  ["Closed", "End state."],
];

export default function DamageCasesGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Damage Cases"
        description="Tracking property damage and warranty claims tied to a job — what a case captures, how cost rolls up, and a real current limitation in how it connects to a client record."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">What a damage case is</TOCLink>
          <TOCLink href="#where">Where cases live</TOCLink>
          <TOCLink href="#creating">Opening a case</TOCLink>
          <TOCLink href="#status">Status</TOCLink>
          <TOCLink href="#expenses">Expenses &amp; cost tracking</TOCLink>
          <TOCLink href="#po-link">Linking a Purchase Order</TOCLink>
          <TOCLink href="#automations">Automations &amp; Zapier</TOCLink>
          <TOCLink href="#client-linking">The client-linking limitation</TOCLink>
        </div>
      </div>

      <Section id="overview" title="What a damage case is">
        <p>
          A Damage Case is a standalone record for tracking either property damage caused during a
          job (e.g. a mower striking a client&apos;s sprinkler head or fence) or a warranty claim
          (e.g. a plant that died within its warranty period and needs replacement). Both share the
          same record shape — a <code>caseType</code> field of <code>&quot;damage&quot;</code> or{" "}
          <code>&quot;warranty&quot;</code> — so the feature is really one case-tracking model with
          two flavors, not two separate features.
        </p>
        <p>
          It is not attached to a vehicle-accident or fleet-incident workflow — there is no field
          for at-fault party, insurance carrier, or claim number anywhere in the schema
          (<code>src/types/damage-case.ts:1-27</code>). What it captures is closer to &quot;an
          incident happened at a customer&apos;s property, here&apos;s what it cost to make right.&quot;
        </p>
      </Section>

      <Section id="where" title="Where cases live">
        <p>
          Damage Cases is a Landscapt tool, not a CMMS feature — it&apos;s listed in the crew-hidden
          Tools sidebar as &quot;Track property damage &amp; warranty&quot;
          (<code>src/components/shared/ToolsSidebar.tsx:25</code>). The same{" "}
          <code>DamageCasesPage</code> component is mounted at three separate routes that all render
          identically:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><code>/tools/damage-cases</code> — <code>src/app/(tools)/tools/damage-cases/page.tsx</code></li>
          <li><code>/dashboard/damage-cases</code> — <code>src/app/(dashboard)/dashboard/damage-cases/page.tsx</code></li>
          <li><code>/dashboards/damage-cases</code> — <code>src/app/(reports)/dashboards/damage-cases/page.tsx</code></li>
        </ul>
        <p>
          The page itself has two tabs: <strong>Cases</strong> (a searchable list — by customer,
          case #, description, or property address) and <strong>Reporting</strong> (a chart of
          year-to-date damage vs. warranty cost by month, with YTD summary tiles —{" "}
          <code>src/components/damage-cases/DamageCasesChart.tsx</code>).
        </p>
      </Section>

      <Section id="creating" title="Opening a case">
        <p>
          Cases are opened standalone, from the &quot;Open Case&quot; button on the list page — there
          is no &quot;log damage&quot; action hanging off a Job, Visit, or Ticket record that
          pre-fills a case. A crew member or office staffer fills out a plain form
          (<code>src/components/damage-cases/NewDamageCaseDialog.tsx</code>):
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Required?</th>
              <th className="px-3 py-2">Notes</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {NEW_CASE_FIELDS.map(([field, req, notes]) => (
              <tr key={field} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{field}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{req}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{notes}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A case number is assigned server-side via the <code>next_damage_case_number()</code> RPC.
          Creation retries up to three times on a unique-constraint collision (two concurrent
          submissions computing the same number), rather than surfacing a raw DB error —
          <code>src/lib/hooks/use-damage-cases.ts:74-114</code>.
        </p>
        <p>
          <strong>Worked example.</strong> A mower clips a client&apos;s sprinkler head while mowing
          a back yard. The crew lead (or office, once told) opens a new case: Case Type{" "}
          <em>Damage</em>, Date of Incident set to today, Customer / Property Name typed as{" "}
          <em>&quot;Sterling Storage&quot;</em>, Description{" "}
          <em>&quot;Mower struck and cracked a sprinkler head on the west lawn near the fence
          line.&quot;</em> A photo of the cracked head can be attached afterward from the case&apos;s
          Files tab (see below). The case is now visible in the list with status{" "}
          <strong>Open</strong> and $0.00 total cost until an expense is logged.
        </p>
      </Section>

      <Section id="status" title="Status">
        <p>
          Status is a plain four-value field, changed from a dropdown on the case&apos;s status
          badge — any status can be selected from any other at any time; there is no enforced
          progression or guard rail in the UI or the mutation
          (<code>src/components/damage-cases/DamageCaseDetailPanel.tsx:83-104</code>,{" "}
          <code>src/lib/hooks/use-damage-cases.ts:150-179</code>).
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATUS_ROWS.map(([status, meaning]) => (
              <tr key={status} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{status}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="expenses" title="Expenses & cost tracking">
        <p>
          A case&apos;s <strong>Total Cost</strong> is not a field you set directly — it&apos;s
          derived by summing every non-deleted row in <code>damage_case_expenses</code> for that
          case, both in the list view and the detail panel
          (<code>src/lib/hooks/use-damage-cases.ts:7-58</code>).
        </p>
        <p>
          Continuing the sprinkler-head example: the case&apos;s <strong>Expenses</strong> tab gets
          an entry — Date, an optional Vendor (picked from the shared Vendors table, or typed
          free-text if the vendor isn&apos;t in the system yet), a Description
          (&quot;Replacement sprinkler head + labor&quot;), and an Amount in dollars, stored as
          cents (<code>src/components/damage-cases/AddExpenseDialog.tsx</code>). The case detail
          panel&apos;s Total Cost updates immediately to match.
        </p>
        <p>
          Each expense row also carries a nullable <code>purchaseOrderId</code>
          (<code>src/types/damage-case.ts:19-27</code>), but the Add Expense form always submits it
          as <code>null</code> — there is no UI control to set it per-expense today
          (<code>src/components/damage-cases/AddExpenseDialog.tsx:40</code>). The only PO link that&apos;s
          actually wired up in the UI is the one at the case level, described next.
        </p>
        <p>
          Beyond expenses, each case has generic <strong>Files</strong>, <strong>Comments</strong>,
          and <strong>Audit Trail</strong> tabs shared with other record types across the app
          (<code>AttachmentsSection</code>, <code>CommentsSection</code>, <code>AuditTrailTab</code> —
          <code>src/components/damage-cases/DamageCaseDetailPanel.tsx:284-294</code>). Files accepts
          images, PDFs, and common office documents, so incident photos go here — there is no
          dedicated photo field on the case itself.
        </p>
      </Section>

      <Section id="po-link" title="Linking a Purchase Order">
        <p>
          A case can be linked to a single existing Purchase Order via a searchable picker (by PO
          number or vendor) in the detail panel&apos;s header strip, and unlinked with one click
          (<code>src/components/damage-cases/DamageCaseDetailPanel.tsx:146-207</code>). This writes
          to <code>damage_cases.linkedPoId</code> — it does not create a new PO or requisition from
          the case, and a case does not spawn a repair Work Order either. If parts or materials are
          needed to fix the damage, that PO has to already exist (or be created separately in
          Equipt&apos;s PO module) before it can be linked here.
        </p>
      </Section>

      <Section id="automations" title="Automations & Zapier">
        <p>
          Creating a case fires a <code>damage_case_created</code> event, usable two ways:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Landscapt&apos;s internal Automations</strong> — &quot;Damage case was
            created&quot; is a selectable trigger, filterable by Case Type
            (<code>src/components/crm/automations/SequenceRulesDialog.tsx:71,84-87,131-132</code>).
          </li>
          <li>
            <strong>Zapier</strong> — listed as the &quot;New Damage Case&quot; trigger, delivered
            instantly like the rest of Landscapt&apos;s triggers
            (<code>src/lib/docs-content.ts:1081</code>,{" "}
            <code>src/lib/integrations/zapier-triggers.ts:176-185</code>). See the{" "}
            <a href="/settings/support/zapier-guide" className="text-[#60ab45] underline">
              Zapier guide
            </a>{" "}
            for connection details.
          </li>
        </ul>
        <Callout>
          <strong>The automation only fires if the customer name matches an existing client.</strong>{" "}
          Because <code>customerName</code> is free text (see below), case creation does an
          exact-match lookup against <code>clients.display_name</code> (trimmed, lowercased) purely
          to decide whether to fire the trigger — nothing is written back onto the case either way.
          If the typed name doesn&apos;t match a client exactly, the automation and Zapier trigger
          silently never fire for that case (<code>src/lib/hooks/use-damage-cases.ts:116-146</code>).
          A typo, an abbreviation, or a property name instead of the client&apos;s name on file is
          enough to break this.
        </Callout>
      </Section>

      <Section id="client-linking" title="The client-linking limitation">
        <p>
          <code>damage_cases.customer_name</code> is a plain text column — there is no foreign key
          to <code>clients.id</code>. This is confirmed still true directly in the code, not just in
          CLAUDE.md&apos;s general note about informal client-name strings: the type definition has
          a <code>customerName: string</code> field and no <code>clientId</code>
          (<code>src/types/damage-case.ts:6-17</code>), the New/Edit Case form is a plain text{" "}
          <code>Input</code> with placeholder <em>&quot;e.g. Sterling Storage&quot;</em>, not a
          client picker (<code>src/components/damage-cases/NewDamageCaseDialog.tsx:118-121</code>),
          and case creation has to run an exact-match text lookup against the clients table after
          the fact just to fire automations — a workaround that only exists because there&apos;s no
          real relationship to query (<code>src/lib/hooks/use-damage-cases.ts:116-133</code>).
        </p>
        <Callout>
          <strong>Current impact.</strong> Damage Cases cannot be filtered or reported on by client
          the way Jobs, Estimates, or Invoices can — there&apos;s no client ID to join on. Two cases
          for the same client with slightly different typed names (&quot;Sterling Storage&quot; vs.
          &quot;Sterling Storage LLC&quot;) show up as unrelated. And any automation or Zap keyed off
          a damage case reaching a client&apos;s activity timeline depends entirely on the typed
          name matching the client&apos;s <code>display_name</code> exactly. Per CLAUDE.md, migrating
          this to a real <code>client_id</code> FK is deferred until after the Landscapt dev/prod
          split — until then, treat the customer name field as a label, not a relationship.
        </Callout>
      </Section>
    </DocsFontScope>
  );
}
