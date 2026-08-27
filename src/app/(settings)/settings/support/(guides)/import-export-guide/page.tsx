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
  ["Work Orders", "title", "workOrderNumber, description, priority, status, category, assetName, assignedToName, dueDate, createdAt"],
  ["Assets", "name, assetTag", "equipmentNumber, assetType, make, model, year, serialNumber, location, status, purchaseVendorName, purchaseDate, purchasePrice, paymentMethod, financeInstitution"],
  ["Vehicles", "name, assetTag", "make, model, year, licensePlate, vin, fuelType, status, assignedCrew, purchaseVendorName, purchaseDate, purchasePrice, paymentMethod, financeInstitution"],
  ["Parts", "name, partNumber", "description, category, unitCost, quantityOnHand, minimumStock, vendorName, location"],
  ["Vendors", "name", "contactName, email, phone, address, vendorType, website, notes"],
  ["Requisitions", "title", "vendorName, notes"],
  ["Products", "name, partNumber, category", "description, unitCost, price, quantityOnHand, vendorName, isInventory"],
  ["Purchase Orders", "none enforced — see dedicated section below", "Purchase Order #, Vendor, Status, Created On, Approved On, Completed On, Due Date, Line Type, Line Name, Part Number, Unit Cost, Ordered Quantity, Ordered Cost"],
];

const LANDSCAPT_ENTITIES: [string, string, string][] = [
  ["Clients", "displayName", "accountType, primaryPhone, primaryEmail, billingAddress/City/State/Zip, serviceAddress/City/State/Zip, source, accountNumber"],
  ["Leads", "displayName", "accountType, primaryPhone, primaryEmail, billingAddress/City/State/Zip, source"],
  ["Estimates", "clientName, description", "estimateDate, validUntilDate, poNumber, stage"],
  ["Invoices", "clientName, description, amount", "invoiceDate, dueDate, poNumber, status, taxAmount"],
  ["Payments", "clientName, amount", "paymentDate, method, reference, memo, invoiceNumber"],
  ["Tickets", "subject", "clientName, type, status, priority, category, body, dueDate"],
  ["Services", "name", "code, category, unit, defaultRate, productionRate, isActive"],
  ["Schedules", "name, frequency, dayOfWeek", "weekPattern, anchorDate, seasonStart, seasonEnd, weekOfMonth"],
  ["Employees", "firstName, lastName", "email, phone, cellPhone, address, city, state, zip, dateHired, resourceCode, hourlyRate"],
];

const DEDUPE_BEHAVIOR: [string, string, string][] = [
  ["Vendors", "name (exact match, case-sensitive on lookup, org-scoped)", "Existing vendor is updated with the new row's contact info, address, type, website, notes, and active flag."],
  ["Parts", "partNumber (unique per org)", "Existing part is updated with the new row's name, description, category, cost, quantity, min stock, vendor name, and location."],
  ["Clients", "accountNumber, only when the row supplies one", "Existing client is updated with the new row's contact and address fields. Clients without an account number always insert as new — the org auto-assigns one."],
  ["Leads", "primaryEmail or primaryPhone against every existing non-deleted client", "No new record is created. Instead the matched client is tagged “imported-lead” and the row is counted separately as “matched,” not “created.”"],
  ["Purchase Orders", "po_number (derived as PO-{year}-{csv PO #})", "The row is skipped outright — not merged, not counted as imported. Existing POs are never overwritten by a re-import."],
];

export default function ImportExportGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Administration"
        title="Import & Export"
        description="What Settings → Import / Export actually does for each entity, exactly how row validation and duplicate handling work, and the full mechanics of the bulk Purchase Order importer."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where">Where it lives</TOCLink>
          <TOCLink href="#export">Exporting data</TOCLink>
          <TOCLink href="#import-flow">How an import actually runs</TOCLink>
          <TOCLink href="#entities">What you can import, by entity</TOCLink>
          <TOCLink href="#worked-example">Worked example: importing a batch of vendors</TOCLink>
          <TOCLink href="#dedupe">Validation, duplicates, and what gets skipped</TOCLink>
          <TOCLink href="#po-import">Purchase Order import, in detail</TOCLink>
          <TOCLink href="#name-conflict">The name-conflict audit trail, worked example</TOCLink>
          <TOCLink href="#limitations">Limitations</TOCLink>
        </div>
      </div>

      <Section id="where" title="Where it lives">
        <p>
          Both products have their own Import / Export tab, because each imports a different set of
          entities: <strong>Equipt Settings → Import / Export</strong> and{" "}
          <strong>Landscapt Settings → Import / Export</strong>. Each tab is self-contained —
          an Export Data panel of entity tiles at the top, an Import Data panel of entity tiles below
          it. There is no cross-product import screen; Vendors (shared between Equipt and Landscapt)
          are imported from the Equipt tab only.
        </p>
        <p>
          On an org without Equipt enabled, the Equipt-only tiles (Work Orders, Assets, Vehicles,
          Parts) are hidden from both the export and import panels — only Vendors, Requisitions,
          Products, and Purchase Orders remain, since those are shared with the PO backbone.
        </p>
      </Section>

      <Section id="export" title="Exporting data">
        <p>
          Export is real, and it is genuinely a full data export, not a template stub — each tile
          downloads a CSV of every current record for that entity (not just headers), in the same
          column order and naming as that entity&apos;s import template. Clicking a tile with no
          records in it does nothing (the export handler returns early rather than downloading an
          empty file).
        </p>
        <p>
          Money fields are converted from stored cents to a formatted dollar string on the way out
          (e.g. Parts&apos; unit cost, Purchase Orders&apos; grand total). Everything else is written
          as-is from the record.
        </p>
        <Callout>
          There is no dedicated &quot;Download Template&quot; button in this panel — that&apos;s a
          separate, older component (<code>ImportExportMenu</code>, used on a few standalone list
          pages like Parts and Products) that isn&apos;t wired into the Settings Import/Export tab. In
          practice, an export doubles as the template: its headers match exactly what the matching
          import tile expects, so exporting an entity with a few existing rows and clearing the data is
          the fastest way to see the exact columns before a bulk import.
        </Callout>
      </Section>

      <Section id="import-flow" title="How an import actually runs">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Click an entity tile in the Import Data panel — this opens a file picker restricted to
            <code>.csv</code>.
          </li>
          <li>
            The app reads your CSV&apos;s header row and tries to auto-map every expected column
            against it: exact match first, then a case/punctuation-insensitive match, then a table of
            common aliases (e.g. a column literally titled &quot;Part #&quot;, &quot;SKU&quot;, or
            &quot;Part No&quot; all auto-map to <code>partNumber</code>; &quot;Qty&quot; or &quot;On
            Hand&quot; map to <code>quantityOnHand</code>).
          </li>
          <li>
            If every expected column matched automatically, it skips straight to the preview. If
            anything didn&apos;t match, a <strong>Map Columns</strong> dialog opens listing every
            expected field with a dropdown of your CSV&apos;s actual columns (or &quot;Skip&quot;) —
            this dialog is effectively the field reference, since there&apos;s no separate template
            download.
          </li>
          <li>
            Fields marked with a red asterisk are required for that entity. You cannot continue past
            the mapping dialog until every required field has a column assigned.
          </li>
          <li>
            A <strong>preview</strong> step shows the first 5 mapped rows in a table and the total row
            count, plus an <strong>Import Error</strong> state if the file was empty, unreadable, or
            missing a required mapping. This is the only pre-commit check — there is no
            server-side dry run separate from this client-side preview.
          </li>
          <li>
            Clicking <strong>Import N Rows</strong> sends every mapped row to the entity&apos;s import
            handler at once. A success or error banner appears above the Export/Import panels when it
            finishes.
          </li>
        </ol>
      </Section>

      <Section id="entities" title="What you can import, by entity">
        <p>
          <strong>Equipt</strong> (Settings → Equipt → Import / Export):
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Required columns</th>
              <th className="px-3 py-2">Other columns the template accepts</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {EQUIPT_ENTITIES.map(([name, req, opt]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{req}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{opt}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2">
          <strong>Landscapt</strong> (Settings → Landscapt → Import / Export):
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Required columns</th>
              <th className="px-3 py-2">Other columns the template accepts</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {LANDSCAPT_ENTITIES.map(([name, req, opt]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{req}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{opt}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          Column names in this table are the internal field names the mapping dialog shows (in
          Title Case, e.g. <code>partNumber</code> renders as &quot;Part Number&quot;). Your CSV&apos;s
          actual header text almost never needs to match exactly — the alias matching described
          above handles the common variants.
        </Callout>
      </Section>

      <Section id="worked-example" title="Worked example: importing a batch of vendors">
        <p>
          Say you&apos;re bringing over 40 vendors from a spreadsheet with columns{" "}
          <code>Supplier</code>, <code>Contact</code>, <code>Phone</code>, <code>Email</code>, and{" "}
          <code>Type</code>.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Settings → Equipt → Import / Export → click the Vendors tile under Import Data.</li>
          <li>
            Upload the file. <code>name</code> is the only required field for Vendors, and
            &quot;Supplier&quot; doesn&apos;t auto-match it (it&apos;s not in the alias list), so the
            Map Columns dialog opens with Name still unmapped.
          </li>
          <li>
            Map Name → Supplier, Contact Name → Contact, Email → Email, Phone → Phone,
            Vendor Type → Type. Address, Website, and Notes have no matching column in your sheet,
            so leave them as &quot;Skip&quot; — they aren&apos;t required.
          </li>
          <li>Continue to Preview — confirm the first 5 rows look right, then click Import 40 Rows.</li>
          <li>
            Behind the scenes, rows import one at a time. Any row missing a name is silently dropped
            from the count entirely (not created, not reported as an error). For every remaining row,
            a vendor with that exact <code>name</code> already on file is <strong>updated</strong>{" "}
            in place with the new row&apos;s contact info, address, type, website, notes, and active
            flag — it does not create a duplicate vendor. Everything else inserts as a new vendor.
          </li>
        </ol>
        <p>
          The same shape applies to Parts (keyed on <code>partNumber</code> instead of name) and most
          other entities — see the table in the next section for what&apos;s keyed on what.
        </p>
      </Section>

      <Section id="dedupe" title="Validation, duplicates, and what gets skipped">
        <p>
          The FAQ&apos;s short version — &quot;the importer validates each row before committing&quot;
          — is really two separate mechanisms:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Required-field validation</strong> happens twice: once at the column-mapping step
            (you can&apos;t proceed if a required field has no column assigned), and again per-row at
            import time (a row whose required value is blank after trimming whitespace is dropped and
            counted as &quot;skipped&quot; — it never reaches the database, and it does not stop
            the rest of the batch).
          </li>
          <li>
            <strong>Duplicate handling</strong> is not a validation failure — it&apos;s a merge.
            Rows are inserted one at a time; when the database rejects an insert because of a unique
            constraint (Postgres error code <code>23505</code>), the importer treats that as
            &quot;this record already exists&quot; and updates the existing row instead, rather than
            erroring or creating a second copy.
          </li>
          <li>
            Any <em>other</em> database error (not a duplicate-key violation) is not swallowed —
            it throws, which stops the mutation and surfaces the error message in the preview
            dialog&apos;s error banner. Rows already committed earlier in that same batch stay
            committed; rows after the failure are never attempted. There is no all-or-nothing
            transaction wrapping the whole CSV.
          </li>
        </ul>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Matched on</th>
              <th className="px-3 py-2">On match</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {DEDUPE_BEHAVIOR.map(([name, key, behavior]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{key}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{behavior}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="po-import" title="Purchase Order import, in detail">
        <p>
          Purchase Orders import differently from every other entity — it&apos;s the one importer
          built for a denormalized export format (multiple CSV rows per PO: one row per line item,
          repeating the PO-level fields on every row) rather than one row per record. No column is
          marked required in the UI, because the importer groups rows by{" "}
          <code>Purchase Order #</code> itself — a row with no PO number is silently dropped from
          the group before anything is grouped.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            All rows sharing the same <code>Purchase Order #</code> are grouped together; the first row
            in the group supplies the PO-level fields (Vendor, Status, Created On, Approved On,
            Completed On, Due Date).
          </li>
          <li>
            <strong>Vendor</strong> is matched by name (case-insensitive) against existing vendors; if
            no match exists, a new vendor is created on the fly from just that name.
          </li>
          <li>
            Rows are split by <code>Line Type</code>: <code>PART</code> lines become PO line items and
            drive the subtotal; <code>PERCENT_TAXABLE</code> lines set the tax rate (parsed out of the
            line name, e.g. &quot;CT Sales Tax (6.35%)&quot;) and tax amount; <code>AMOUNT_TAXABLE</code>{" "}
            lines are summed into shipping cost. The PO&apos;s <code>po_number</code> is generated as{" "}
            <code>PO-{"{year}"}-{"{csv PO #}"}</code>, where the year comes from the CSV&apos;s Created
            On date, not today&apos;s date.
          </li>
          <li>
            If a PO with that exact generated number already exists, the whole PO (and all its lines)
            is skipped — not merged, not updated, not counted as imported. Re-running the same
            export is safe; it won&apos;t duplicate POs.
          </li>
          <li>
            For each PART line, the importer resolves a Products catalog entry by{" "}
            <code>Part Number</code> first, falling back to matching by item name only when no part
            number is given. If nothing matches either way, a new catalog entry is created (category
            defaults to <code>maintenance_part</code>). A line with neither a usable part number nor a
            name is skipped rather than inserted without a catalog reference — every PO line item
            must reference a Products catalog entry per this platform&apos;s data rules.
          </li>
          <li>
            When the resolved catalog entry has a part number, the importer also syncs it into CMMS
            Parts inventory: it links to an existing Part with that <code>product_item_id</code> or{" "}
            <code>part_number</code> if one exists, or creates a new Part record at zero quantity on
            hand otherwise. Quantity on hand is <em>not</em> incremented by a PO import — that only
            happens through the separate Goods Receipt flow.
          </li>
        </ol>
      </Section>

      <Section id="name-conflict" title="The name-conflict audit trail, worked example">
        <p>
          The Products catalog and Parts inventory each keep <em>one</em> name per part number —
          whichever name they saw first. If a later PO import uses a different name for a part number
          that&apos;s already on file, the importer does not overwrite the existing name and does not
          silently keep the newer one either — it leaves the catalog untouched and writes a{" "}
          <code>name_conflict</code> entry to that record&apos;s audit trail so the mismatch can be
          reviewed instead of lost.
        </p>
        <Callout>
          <strong>Example.</strong> Your first PO import brings in part number <code>OF-4521</code>{" "}
          labeled &quot;Oil Filter&quot; from Vendor A on PO-2024-1002. Six months later you import a
          second batch that includes the same part number, <code>OF-4521</code>, from Vendor B, but
          their line item is labeled &quot;Premium Oil Filter&quot; on PO-2024-1140. The catalog entry
          for <code>OF-4521</code> stays &quot;Oil Filter&quot; — it is not renamed. Instead, an
          audit trail entry is written on that product (and on the linked Part, if one exists) reading
          something like: &quot;Import name conflict on PO-2024-1140 (not applied): catalog has &apos;Oil
          Filter&apos;, import line used &apos;Premium Oil Filter&apos;.&quot;
        </Callout>
        <p>
          This is intentionally conservative: if the two names really do describe the same
          interchangeable part, no action is needed — the catalog is still correct and the PO line
          still links to the right record. If they turn out to be two genuinely different parts that
          happen to share a part number by data-entry mistake, the audit trail entry is what tells you
          to go split them apart rather than assuming a later import quietly relabeled something.
        </p>
        <p>
          The same check runs independently for the Products catalog entry and, when one is linked, the
          CMMS Part record — so a single conflicting import line can produce up to two audit trail
          entries: one on the product, one on the part.
        </p>
      </Section>

      <Section id="limitations" title="Limitations">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>CSV only.</strong> No Excel (.xlsx), JSON, or other format is accepted by either the
            file picker or the underlying parser.
          </li>
          <li>
            <strong>No standalone template download in this panel.</strong> Use an export of the same
            entity (even with a couple of dummy rows deleted afterward) as your column reference, or
            rely on the Map Columns dialog, which lists every expected field.
          </li>
          <li>
            <strong>No pre-commit server-side dry run.</strong> The 5-row preview table is a client-side
            rendering of your mapped CSV, not a validation pass against the database — duplicate
            and error handling only happens once you click Import.
          </li>
          <li>
            <strong>Import only creates or merges — it never deletes.</strong> There is no way to
            remove records via CSV; re-importing an export you haven&apos;t edited is a safe no-op for
            entities that dedupe by a stable key, but it will not clean up records removed from the
            source system.
          </li>
          <li>
            <strong>Requisitions import has no vendor auto-create logic</strong> the way Purchase Orders
            does — check your vendor names are already in the system (or import Vendors first) if
            you&apos;re bulk-loading requisitions with a <code>vendorName</code> column.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
