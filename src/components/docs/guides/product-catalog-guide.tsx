import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const CATEGORIES: [string, string, string][] = [
  [
    "Maintenance Part",
    "Feeds CMMS parts inventory. Saving one auto-creates (and keeps in sync) a matching row in Parts.",
    "Can't take a project. Quantity must stay a whole number.",
  ],
  [
    "Stocked Material",
    "Landscape supplies kept on hand (mulch, seed, fertilizer).",
    "Can optionally be assigned to a project on a PO/Requisition line.",
  ],
  [
    "Project Material",
    "Job-specific materials bought for one particular job.",
    "Can optionally be assigned to a project on a PO/Requisition line.",
  ],
];

export function ProductCatalogGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Purchasing"
        title="Managing the Products Catalog"
        description="The single source of truth for every purchasable item — and how the Maintenance Part category quietly keeps a second table in sync behind the scenes."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#basics">Why a catalog is required</TOCLink>
          <TOCLink href="#categories">The three categories</TOCLink>
          <TOCLink href="#fields">Adding a product</TOCLink>
          <TOCLink href="#chemicals">Chemical tracking</TOCLink>
          <TOCLink href="#maintenance-part-link">The Maintenance Part ↔ CMMS Parts link</TOCLink>
          <TOCLink href="#cost-vs-price">Unit Cost vs. Sale Price vs. a PO line&apos;s actual cost</TOCLink>
          <TOCLink href="#archiving">Archiving a product</TOCLink>
          <TOCLink href="#import">Bulk import</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="basics" title="Why a catalog is required">
        <p>
          Go to <strong>Purchasing &gt; Products</strong>. Every line item on a Requisition or PO
          must reference a catalog entry here — there is no free-text line-item option. This keeps
          naming, categorization, and cost reporting consistent across every order.
        </p>
      </Section>

      <Section id="categories" title="The three categories">
        <p>Category is required and picked once, at creation:</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">What it does</th>
              <th className="px-3 py-2">Project assignment</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {CATEGORIES.map(([name, does, project]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{does}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{project}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Enforced at the database, not just the form.</strong> A trigger on both PO and
          Requisition line items blocks a Maintenance Part line from ever carrying a{" "}
          <code>project_id</code> — added specifically after two separate UI paths (an inline line
          edit, and adding to an existing PO/Requisition from a Project&apos;s detail panel) were
          found to let it slip through. It&apos;s not just a form validation; it can&apos;t happen at
          all now, from any screen.
        </Callout>
      </Section>

      <Section id="fields" title="Adding a product">
        <p>
          Click <strong>+ New Product</strong>. The Details tab has: Name (required), Category
          (required), Part Number/SKU, Vendor (with inline &ldquo;create new vendor&rdquo;), Unit
          Cost, Sale Price, Description, and a &ldquo;Track inventory quantity&rdquo; checkbox that
          reveals a Quantity on Hand field when checked.
        </p>
        <p>
          Selecting category <strong>Maintenance Part</strong> reveals an additional highlighted
          block: <strong>Part Category</strong> (a dropdown of your org&apos;s configured CMMS part
          categories) and <strong>Min Stock</strong>. Neither field appears for Stocked Material or
          Project Material.
        </p>
      </Section>

      <Section id="files" title="Files and photos">
        <p>
          Open a product and use its <strong>Files</strong> tab to attach spec sheets, safety data
          sheets (SDS), manuals, or photos of the item. Drag files in or click to upload; images,
          PDFs, Word, Excel, CSV and text files are accepted. Attachments are stored per product and
          can be downloaded or deleted from the same tab.
        </p>
      </Section>

      <Section id="chemicals" title="Chemical tracking">
        <p>
          Checking <strong>Track Chemicals</strong> reveals a second Chemical tab: Scientific Name,
          EPA Registration #, EPA URL, Label Instructions, Client Route Sheet Instructions,
          Re-Entry Interval, a &ldquo;Restricted Use Product&rdquo; flag, and a repeatable list of
          Active Ingredients (name + percentage). Use this for any fertilizer, herbicide, or
          pesticide product where label compliance and client-facing route sheets matter.
        </p>
        <p>
          <strong>Confirming what was applied.</strong> When a visit is dispatched, its
          service&apos;s chemicals are loaded onto it at the <em>planned</em> amount. That is only an
          estimate: it is not counted in the Chemical Tracking report or taken out of stock until
          someone confirms the amount actually used, or marks the product <strong>Not used</strong>.
          Under <strong>Settings &gt; Chemical Tracking &gt; Who Confirms Chemicals Applied</strong>{" "}
          choose <strong>Crew</strong> (the default) &mdash; the crew enters the amounts on the stop,
          and can&apos;t Stop Job until they do &mdash; or <strong>Office adds amounts later</strong>,
          which removes that requirement. The office can confirm from the visit&apos;s Chemicals tab
          (<strong>Confirm all as planned</strong>, or edit and Save a row), and an admin can click{" "}
          <strong>Allow completing without confirmation</strong> for a single visit. Chemicals added
          by hand are recorded as entered and don&apos;t need confirming.
        </p>
        <p>
          <strong>Estimated amounts.</strong> With <strong>Settings &gt; Chemical Tracking &gt;
          Default Chemical Quantity</strong> on and an <strong>Area Custom Field</strong> chosen
          (for example Turf Sq. Ft.), the planned amount is the product&apos;s default Application
          Rate multiplied by the property&apos;s area. The rate&apos;s area unit is honored, so a
          rate &ldquo;per 1,000 Sq Ft&rdquo; or &ldquo;per Acre&rdquo; is converted to square feet
          before the math, and a field measured in acres or square yards is converted too. The built-in
          takeoff fields count as an Area Custom Field, and a job
          with no property of its own uses the client&apos;s property when the client has exactly
          one. A client with two or more properties and no property on the job gets no estimate
          rather than a guess. Start and end time inputs on the application record are optional.
        </p>
        <p>
          <strong>Which area is used.</strong> Three things can change the area, in this order:
          (1) a <strong>treated area</strong> on the job service &mdash; typed on the estimate
          line&apos;s notes menu (Treated Area tab) and carried to the job, or edited on the job&apos;s
          Services tab &mdash; for a spot treatment or just the front lawn; (2) the service&apos;s own{" "}
          <strong>Area measurement for chemical quantities</strong> (Services &amp; Pricing &rarr; the
          service &rarr; Chemicals tab), for example Parking Lot / Hardscape Sq. Ft. on a parking-lot
          weed control service; (3) the org&apos;s Area Custom Field above. Any measurement, including a Number
          custom field, is read from the property first and then from the client. The Materials Needed report,
          the Daily Load List, the crew&apos;s preloaded amounts and the application panel all use the same
          order, so they agree. Rate Matrix pricing uses the same property-then-client lookup for its
          keyed field.
        </p>
        <p>
          <strong>Per-linear-foot rates.</strong> Perimeter and barrier products are often labelled per
          linear foot. Add an area unit such as &ldquo;100 Linear Ft&rdquo; or &ldquo;1,000 Linear Ft&rdquo;
          (new orgs get both), use it on the product&apos;s Application Rate, and set the service&apos;s area
          measurement to a linear-foot field such as Linear Ft. Perimeter or Linear Ft. Edging. A linear-foot
          rate is only sized from a linear-foot field, and a square-foot rate only from an area field: when they
          don&apos;t match, no amount is estimated and the Daily Load List and the application panel say why,
          so enter that amount by hand. A treated area on the job service is in the same unit as the field the
          service sizes from. Fields that can&apos;t size a rate, such as Yards of Mulch or a count, aren&apos;t
          offered.
        </p>
        <p>
          <strong>Stock.</strong> When a visit is completed, each confirmed, used chemical
          application takes its concentrate amount out of the product&apos;s on-hand quantity,
          converted into the unit of the product&apos;s default Application Rate (the product needs
          one, and &ldquo;Track inventory quantity&rdquo; on). Changing the amount, marking it Not
          used, deleting it, or reopening the visit puts the stock back, and a deduction never takes
          the quantity below zero or blocks completing the job. Stock quantities on a product can
          have decimals.
        </p>
        <p>
          <strong>Notice of Treatment (the leave-behind).</strong> Everything recorded on a visit
          &mdash; date, time, weather, applicator and license number, and each product with its EPA
          Registration #, amount, method and target &mdash; can be turned into a customer-facing
          notice that replaces the paper carbon copy. Re-entry intervals and each product&apos;s
          Client Route Sheet Instructions appear under &ldquo;Recommended procedures&rdquo;. Three
          ways to use it: <strong>Print Notice</strong> on the visit&apos;s Chemicals tab;{" "}
          <strong>Send Email</strong> (the notice goes in the message in a compact form, and a full
          PDF copy is attached unless you untick <strong>Attach the Notice of Treatment as a
          PDF</strong>; the email template tag <strong>[chemicalnotice]</strong> drops the compact
          notice anywhere in the message); or an automation on a completed visit with
          <strong> [chemicalnotice]</strong> in its email, which is how clients billed under a
          contract &mdash; and so never get an invoice &mdash; still receive the record. Use that tag
          in an email with little or no wait after the visit, because it reads the client&apos;s most
          recent completed visit.
        </p>
        <p>
          <strong>Three kinds of chemical email.</strong> <strong>Send Email</strong> on the
          visit&apos;s Chemicals tab lets you choose an <strong>Email type</strong>:{" "}
          <strong>Client Instruction</strong> (the notice of what was applied, with care
          instructions), <strong>Recommendation</strong> (something the technician noticed, such as
          a future treatment, watering, or damage) and <strong>Upsale</strong> (other services the
          client could add). Build the templates under Documents, choosing{" "}
          <strong>Chemical &ndash; Client Instruction</strong>, <strong>Chemical &ndash;
          Recommendation</strong> or <strong>Chemical &ndash; Upsale</strong> as the type; each email
          type offers only its own templates. A Recommendation or Upsale can be sent on any visit,
          even one with no chemicals recorded.
        </p>
        <p>
          <strong>Reference Library (labels and Safety Data Sheets).</strong> Open{" "}
          <strong>Reference Library</strong> in the <strong>Tools</strong> sidebar to keep every
          chemical label and Safety Data Sheet in one place, along with SOPs, training material
          and equipment lists. <strong>Upload documents</strong> takes PDFs, images, Word and Excel
          files, several at a time; each one gets a type (SDS, label, SOP, training, equipment,
          other), an optional revision date, and the chemical products it covers. Documents linked to
          a product appear on that product&apos;s page under <strong>Labels &amp; Safety Data Sheets</strong>{" "}
          and open from the crew&apos;s <strong>View label</strong> on a stop. You can also add one straight from the product: <strong>Add document</strong> on its page uploads the file into the library already linked to that product. Everything in the library is
          also on the crew app&apos;s <strong>Reference</strong> screen (browser and iOS/Android), with
          search and filters; untick <strong>Show to crews</strong> to keep a document office-only.
          Anyone with a CRM seat can open the library; adding, editing and deleting needs the
          CRM Settings permission.
        </p>
        <p>
          <strong>Working through a day in the Chemical Tracking dialog.</strong> Open it from the
          Dispatch Board&apos;s <strong>Chemical Tracking</strong> button. <strong>Save &amp; Next</strong>{" "}
          saves any chemical you edited on the open visit and moves on (visits you didn&apos;t touch
          are left as they are, so nothing is confirmed by accident); <strong>Previous</strong> and{" "}
          <strong>Save &amp; Close</strong> save the same way. Each visit shows whether its Notice of
          Treatment email has been sent, and <strong>Send notices</strong> shows how many of the day&apos;s
          visits have gone out. <strong>Conditions</strong> records one temperature, wind and pH for
          every visit in the list at once, and <strong>Fill from weather</strong> there (and on each
          visit&apos;s own Conditions box) pulls the temperature and wind from the National Weather
          Service &mdash; the same service as the board&apos;s weather chip &mdash; using the reading
          nearest the time the chemicals went on, when that is within the last week. You can edit
          the figures before saving.
        </p>
        <p>
          <strong>Sending many notices at once.</strong> In the Chemical Tracking wizard click{" "}
          <strong>Send notices</strong>, or select visits on the Dispatch Board and choose{" "}
          <strong>Actions &gt; Send Chemical Notices</strong>. The dialog sorts the visits into{" "}
          <em>ready to send</em>, <em>already sent</em>, <em>no email on file</em>,{" "}
          <em>email bounced</em> and <em>no confirmed application</em>. Choose a template (or edit the
          subject and message), decide whether to attach the PDF, and click Send. Each client gets
          their own email with their own visit&apos;s products, amounts and conditions. Only the
          ready visits are sent, so running it twice never double-sends unless you tick{" "}
          <strong>Also re-send</strong>. A progress bar shows the send, and any failures are listed
          afterwards with the reason.
        </p>
        <p>
          <strong>Printed chemical route sheets.</strong> On the Dispatch Board choose{" "}
          <strong>Print &gt; Chemical sheets</strong> (or <strong>Print route sheets</strong> in the
          Chemical Tracking wizard). Each chemical stop prints two landscape pages: the
          crew&apos;s copy (planned amounts, label instructions, blanks for time, weather and what
          was actually used), then a full-width notice for the customer with the amounts and weather
          left blank to write in, so the page can be handed over or torn off cleanly.
        </p>
        <p>
          <strong>Compliance report.</strong> The Chemical Tracking report lists applications on
          visits that are in progress or completed, in a compact set of columns that prints
          landscape and exports to a readable PDF.
        </p>
      </Section>

      <Section id="maintenance-part-link" title="The Maintenance Part ↔ CMMS Parts link">
        <p>
          There is no picker to manually link a product to an existing Part. Instead, saving a
          product with category <strong>Maintenance Part</strong> automatically creates a matching
          row in CMMS Parts, copying over name, part number, description, unit cost, quantity on
          hand, minimum stock, and vendor. From then on the two rows are kept in sync automatically:
          editing any of those fields on the product pushes the same change to its linked part, and
          quantity changes (from receiving or Work Order parts usage) flow through a row-locked
          database function on both sides so concurrent updates can&apos;t corrupt the count.
        </p>
        <Callout>
          <strong>No linking to a pre-existing Part.</strong> If a Part already exists in CMMS for
          the same physical item, creating a new Maintenance Part product with a similar name does{" "}
          <em>not</em> connect to it — it creates a second, separate Part record. Check CMMS &gt;
          Parts first if you suspect a duplicate already exists.
        </Callout>
      </Section>

      <Section id="cost-vs-price" title="Unit Cost vs. Sale Price vs. a PO line's actual cost">
        <p>
          A product has two money fields: <strong>Unit Cost</strong> (what you pay) and{" "}
          <strong>Sale Price</strong> (what a client is charged, used elsewhere in job/estimate
          pricing — not used by Purchasing at all). Only Unit Cost is touched by receiving.
        </p>
        <p>
          The catalog&apos;s Unit Cost is a <strong>suggestion</strong>, not a lock. When you add the
          product to a new PO or Requisition line, the line pre-fills from the catalog cost (via
          whichever costing method your org uses — see the Inventory Costing Methods guide) but the
          line&apos;s cost field is fully editable from there. Changing it on the line does{" "}
          <strong>not</strong> write back to the catalog — the two can silently diverge, and that&apos;s
          expected.
        </p>
      </Section>

      <Section id="archiving" title="Archiving a product">
        <p>
          Deleting a product is a <strong>soft delete</strong> — it sets an internal
          &ldquo;removed&rdquo; timestamp rather than actually erasing the row, even though the
          confirmation dialog says the action &ldquo;cannot be undone.&rdquo; An archived product
          disappears from the catalog list and can no longer be selected on a new line, but every PO
          or Requisition that already referenced it is unaffected — those records store their own
          copy of the name, part number, and cost at the time they were ordered, so historical
          documents keep displaying correctly. There is currently no Restore button anywhere in the
          UI; reactivating an archived product requires a direct database change.
        </p>
        <p>
          Deleting a <strong>Maintenance Part</strong> product also retires its matching CMMS Part
          (and that part&apos;s asset links), so a part never stays in the Parts list and the PO
          part picker pointing at a catalog product that no longer exists. If a product is ever moved
          into the Maintenance Part category (through the API), its CMMS part is created, or an
          unlinked part with the same part number is adopted; moving it out retires the part.
        </p>
      </Section>

      <Section id="import" title="Bulk import">
        <p>
          Products can be bulk-imported from two places — the Products page toolbar, and Settings
          &gt; Equipt Settings &gt; Import/Export — both calling the same underlying import logic,
          see the Import &amp; Export guide for the general mechanics. A few product-specific
          details worth knowing:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Category is normalized loosely.</strong> Values like &ldquo;parts,&rdquo;
            &ldquo;stock,&rdquo; &ldquo;supplies,&rdquo; or &ldquo;job&rdquo; are all recognized and
            mapped to the correct category — you don&apos;t need the exact enum spelling in your
            spreadsheet. A row with an unrecognizable category, or a missing name, is skipped rather
            than failing the whole import.
          </li>
          <li>
            <strong>Re-imports only touch what the file carries.</strong> For a product that
            already exists, a blank quantity, cost, price or vendor cell leaves the saved value
            alone (a cost-only file doesn&apos;t zero the stock), and a quantity that is filled in
            is applied as a recorded stock adjustment. Quantities can be decimals for materials;
            maintenance parts must be whole numbers, and a negative or non-numeric quantity fails
            that row with the reason shown. A vendor name is linked to your existing vendor when
            exactly one vendor has that name (not case-sensitive).
          </li>
          <li>
            <strong>Dedup only works by Part Number.</strong> A row whose part number matches an
            existing product updates that product instead of creating a duplicate. Rows with a blank
            part number always insert as new — two rows with the identical name but no part number
            become two separate catalog entries, not one.
          </li>
        </ul>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Product names aren&apos;t required to be unique.</strong> Only Part Number is
            deduplicated (and only when it&apos;s non-blank) — nothing stops two products from
            sharing the exact same name.
          </li>
          <li>
            <strong>The delete confirmation is misleading.</strong> It reads &ldquo;This action
            cannot be undone&rdquo; but the underlying operation is a reversible soft delete.
          </li>
          <li>
            <strong>Maintenance Part quantities must stay whole numbers</strong>, enforced by the
            database on the product, and again on every Requisition, PO, and receiving line that
            references it — attempting a fractional quantity (e.g. via a CSV import) fails with a
            database error rather than a form warning. Stocked Material and Project Material support
            two decimal places (e.g. partial yards of mulch).
          </li>
          <li>
            <strong>The two import entry points require slightly different columns</strong> — the
            Products-page importer doesn&apos;t require Part Number, the Settings-tab importer does
            — even though both run identical logic underneath.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
