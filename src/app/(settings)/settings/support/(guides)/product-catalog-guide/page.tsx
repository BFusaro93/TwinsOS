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

export default function ProductCatalogGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Purchasing"
        title="Managing the Products Catalog"
        description="The single source of truth for every purchasable item — and how the Maintenance Part category quietly keeps a second table in sync behind the scenes."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#basics">Why a catalog is required</TOCLink>
          <TOCLink href="#categories">The three categories</TOCLink>
          <TOCLink href="#fields">Adding a product</TOCLink>
          <TOCLink href="#chemicals">Chemical tracking</TOCLink>
          <TOCLink href="#maintenance-part-link">The Maintenance Part ↔ CMMS Parts link</TOCLink>
          <TOCLink href="#cost-vs-price">Unit Cost vs. Sale Price vs. a PO line's actual cost</TOCLink>
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
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{does}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{project}</td>
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

      <Section id="chemicals" title="Chemical tracking">
        <p>
          Checking <strong>Track Chemicals</strong> reveals a second Chemical tab: Scientific Name,
          EPA Registration #, EPA URL, Label Instructions, Client Route Sheet Instructions,
          Re-Entry Interval, a &ldquo;Restricted Use Product&rdquo; flag, and a repeatable list of
          Active Ingredients (name + percentage). Use this for any fertilizer, herbicide, or
          pesticide product where label compliance and client-facing route sheets matter.
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
