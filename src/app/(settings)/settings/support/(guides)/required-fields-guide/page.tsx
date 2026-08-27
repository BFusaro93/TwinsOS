import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const EQUIPT_ENTITIES: [string, string, string][] = [
  ["Purchase Orders", "Vendor, Project, Notes, Shipping Cost", "Vendor"],
  ["Requisitions", "Vendor, Title, Notes", "Title"],
  ["Work Orders", "Priority, Category, Assigned To, Estimated Hours, Due Date", "Priority"],
  ["Assets", "Location, Serial Number, Year, Make / Model", "— none"],
  ["Vehicles", "License Plate, Year, Make, Model, Mileage", "Year, Make"],
];

const CRM_ENTITIES: [string, string, string][] = [
  ["Clients", "Phone, Email, Source", "— none"],
  ["Tickets", "Client, Assigned To, Due Date", "— none"],
  ["Estimates", "Sales Rep, Valid Until", "— none"],
  ["Jobs", "Crew, Sales Rep", "— none"],
];

export default function RequiredFieldsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Administration"
        title="Required Fields"
        description="What Required Fields actually controls, entity by entity — and where it stops."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">Overview</TOCLink>
          <TOCLink href="#where">Where it lives</TOCLink>
          <TOCLink href="#three-states">The three states: Required, Optional, Hidden</TOCLink>
          <TOCLink href="#equipt-fields">Equipt: configurable fields</TOCLink>
          <TOCLink href="#crm-fields">Landscapt: configurable fields</TOCLink>
          <TOCLink href="#always-required">Always required, no matter what</TOCLink>
          <TOCLink href="#worked-example">Worked example: requiring Vendor on Requisitions</TOCLink>
          <TOCLink href="#enforcement">How enforcement actually works</TOCLink>
        </div>
      </div>

      <Section id="overview" title="Overview">
        <p>
          Required Fields lets an admin change whether a given field on a creation form must be
          filled in, is left optional, or is removed from the form entirely — per entity, for your
          whole organization. It covers nine entities across both products: five in Equipt
          (Purchase Orders, Requisitions, Work Orders, Assets, Vehicles) and four in Landscapt
          (Clients, Tickets, Estimates, Jobs).
        </p>
        <p>
          This is narrower than a general field-permissions system — it only governs the specific
          fields listed on this page, not every field on every record, and (as covered below) two
          of the nine entities are configurable in the settings UI but not actually read by any
          form yet.
        </p>
      </Section>

      <Section id="where" title="Where it lives">
        <p>
          There are two separate settings screens, one per product, both writing to the same
          underlying setting:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Screen</th>
              <th className="px-3 py-2">Covers</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                Equipt Settings → Required Fields
              </td>
              <td className="px-3 py-2 text-[#4a4a46]">
                Purchase Orders, Requisitions, Work Orders, Assets, Vehicles.
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                Landscapt Settings → CRM → Required Fields
              </td>
              <td className="px-3 py-2 text-[#4a4a46]">
                Clients, Tickets, Estimates, Jobs.
              </td>
            </tr>
          </tbody>
        </Table>
        <p>
          Both screens edit the same org-level setting, stored once as your organization&apos;s{" "}
          <code>customizations.requiredFields</code> value. There is no per-role version of this
          setting — every user in your org sees the same required/optional/hidden state on every
          form, regardless of their role. Changing it on either screen and clicking{" "}
          <strong>Save Required Fields</strong> applies immediately, org-wide, to every user.
        </p>
      </Section>

      <Section id="three-states" title="The three states: Required, Optional, Hidden">
        <p>Every configurable field on this page can be set to one of three states:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Required</strong> — the form won&apos;t let anyone save until the field has a
            value. The field label gets a red asterisk.
          </li>
          <li>
            <strong>Optional</strong> — the field is shown, but can be left blank. This is the
            default state for most fields.
          </li>
          <li>
            <strong>Hidden</strong> — the field is removed from the form entirely. It doesn&apos;t
            just become uneditable; the input, its label, and its section of the form don&apos;t
            render at all.
          </li>
        </ul>
        <Callout>
          Hiding a field only affects the <em>creation</em> form. It doesn&apos;t delete existing
          values already saved on records, and it doesn&apos;t remove the field from detail views,
          reports, or edit screens elsewhere in the product — only from the specific &quot;New
          &hellip;&quot; dialog this page&apos;s tables describe.
        </Callout>
      </Section>

      <Section id="equipt-fields" title="Equipt: configurable fields">
        <p>
          Every field below is read by its entity&apos;s creation form. The last column shows what
          ships as <strong>Required</strong> out of the box — everything else defaults to{" "}
          <strong>Optional</strong>, and nothing in Equipt defaults to <strong>Hidden</strong>.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Configurable fields</th>
              <th className="px-3 py-2">Required by default</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {EQUIPT_ENTITIES.map(([name, fields, def]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{fields}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{def}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A field showing up as required by default doesn&apos;t mean it&apos;s locked — every
          field on this page, including Purchase Order Vendor and Work Order Priority, can be
          switched to Optional or Hidden the same as any other. There is no field on this list
          that the settings screen refuses to let you loosen.
        </p>
      </Section>

      <Section id="crm-fields" title="Landscapt: configurable fields">
        <p>
          Landscapt&apos;s Required Fields tab shows all four entities, but only two of them are
          currently wired into a real form:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Configurable fields</th>
              <th className="px-3 py-2">Required by default</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {CRM_ENTITIES.map(([name, fields, def]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{fields}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{def}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Estimates and Jobs are fully enforced too: the New Estimate dialog reads Sales Rep and
          Valid Until, and both job-creation paths — New Job and Convert Estimate to Job — read
          Crew (New Job also reads Sales Rep; Convert Estimate to Job has no Sales Rep field of
          its own to enforce). Client and Ticket remain enforced the same way, via the New Client
          dialog, the Client detail edit panel, and the New Ticket dialog.
        </p>
      </Section>

      <Section id="always-required" title="Always required, no matter what">
        <p>
          A handful of fields aren&apos;t on the Required Fields screen at all because they&apos;re
          required unconditionally, at the form level — no setting can loosen them:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Requisition Title</strong> and <strong>Work Order Title</strong> — both forms
            block saving on an empty title regardless of any Required Fields setting.
          </li>
          <li>
            <strong>Line items on Purchase Orders and Requisitions must reference a Products
            catalog entry.</strong> Every line needs a selected catalog product before the form
            will save — there is no way to leave a line item&apos;s product unselected, hide that
            requirement, or save a free-text line description in its place.
          </li>
        </ul>
        <Callout>
          This second point matches the platform-wide rule that the Products catalog is the single
          source of truth for anything purchasable: a PO or Requisition line item always points at
          a real catalog entry, never a free-text description, and Required Fields has no lever
          over that.
        </Callout>
      </Section>

      <Section id="worked-example" title="Worked example: requiring Vendor on Requisitions">
        <p>
          Requisitions ship with <strong>Vendor</strong> set to Optional — a requester can submit a
          requisition before anyone has picked a vendor, since sourcing often happens after the
          request is approved. Suppose your org wants to skip that step and always capture a
          vendor up front:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Go to <strong>Equipt Settings → Required Fields</strong>.</li>
          <li>Find the <strong>Requisitions</strong> card and locate the <strong>Vendor</strong> row.</li>
          <li>
            Change its dropdown from <strong>Optional</strong> to <strong>Required</strong>.
          </li>
          <li>Click <strong>Save Required Fields</strong> at the bottom of the page.</li>
        </ol>
        <p>
          From that point on, every user who opens the New Requisition dialog sees a red asterisk
          next to Vendor, and the Save button stays disabled until a vendor is selected — including
          for requisitions started before the change, if they&apos;re still in draft when reopened.
          Reverting the dropdown back to Optional removes the restriction immediately for everyone,
          with no effect on requisitions already saved either way.
        </p>
      </Section>

      <Section id="enforcement" title="How enforcement actually works">
        <p>
          Required Fields is enforced entirely in the browser, inside the specific creation dialog
          for each entity. There is no server-side or database check behind it — no API route
          validates a request against your org&apos;s Required Fields setting, and no database
          constraint rejects a record for missing a field this setting marks Required.
        </p>
        <Callout>
          <strong>What this means in practice:</strong> the setting stops someone from clicking
          Save in the app UI with a required field blank. It does not, by itself, stop a record
          from being created with that field empty through any other path — a bulk import, a
          direct API call, or a future integration that writes to the same tables. Treat Required
          Fields as UI-level guardrails for people using the app day to day, not as a data
          guarantee you can rely on everywhere a record might be created.
        </Callout>
        <p>
          This is a different mechanism from the required-field checks on the public
          maintenance-request portal&apos;s custom forms, which validate submitted portal forms
          against each field&apos;s own <code>required</code> flag — a separate, form-builder-level
          setting unrelated to this page.
        </p>
      </Section>
    </DocsFontScope>
  );
}
