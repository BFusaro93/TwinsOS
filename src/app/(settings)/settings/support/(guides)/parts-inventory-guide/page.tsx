import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const NEW_PART_FIELDS: [string, string][] = [
  ["Name", "What shows up everywhere — Parts list, Assets tab, PO line items."],
  ["Part number", "The manufacturer/vendor part number. Used to match incoming PO receipts."],
  ["Unit of measure", "Each, box, gallon, etc. — how the part is counted and ordered."],
  ["Minimum stock level", "The reorder threshold. Quantity at or below this triggers Low Stock."],
  ["Current quantity on hand", "Starting count. After creation, this should only move via receiving — see below."],
  ["Picture", "Optional. Helps techs confirm they grabbed the right part off the shelf."],
  ["Storage location", "Optional free text — bin, shelf, truck stock, etc."],
  ["Categories", "Optional, one or more — used for search/filtering in the Parts list."],
];

const LIFECYCLE_STEPS: [string, string][] = [
  ["1. Create the part", "CMMS → Parts → “+ New Part.” Name: “Oil Filter — OEM 51515.” Unit of measure: each. Minimum stock level: 4. Starting quantity on hand: 10."],
  ["2. Link it to assets", "Open the part, go to the Assets tab, and link it to Mower #3 and Mower #7 — both use the same filter. The part now shows on both assets’ “parts typically used” list."],
  ["3. Stock runs down", "Work orders against either mower consume filters over a few months. Quantity on hand drifts down to 4."],
  ["4. Low Stock fires", "At quantity 4 (at or below the minimum of 4), a Low Stock badge appears on the part and a bell notification fires. If the “Low Stock Alert” automation is configured, a draft requisition is created automatically."],
  ["5. Requisition → PO", "A Purchase Requisition is created (or confirmed, if auto-created) using the Maintenance Part product entry that corresponds to this part. It moves through the normal approval chain and becomes a PO."],
  ["6. Receive it", "Purchasing → Receiving → “+ New Receipt” against that PO. Because the line is a Maintenance Part, quantity on hand on the Oil Filter — OEM 51515 part increments automatically — this is the only place the count changes."],
  ["7. Cost updates", "If the receipt’s unit cost differs from what was on file, the part’s unit cost updates — and because the part is linked to a Products catalog entry, that product’s cost updates too, so CMMS Parts and Purchasing Products keep showing the same number. Exactly how that landed cost is calculated depends on the org’s Costing Method (Manual / WAC / FIFO)."],
];

export default function PartsInventoryGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Equipt (CMMS)"
        title="Parts Inventory"
        description="Adding parts, linking them to assets, keeping stock and cost in sync, and when to split a part number into two."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#adding-a-part">Adding a part</TOCLink>
          <TOCLink href="#assets-many-to-many">Parts ↔ Assets: why it’s many-to-many</TOCLink>
          <TOCLink href="#vendors">Vendors on a part</TOCLink>
          <TOCLink href="#lifecycle-example">Worked example: one part, start to finish</TOCLink>
          <TOCLink href="#interchangeable-parts">Interchangeable parts: split vs. alternate vendor</TOCLink>
          <TOCLink href="#replenishing">Replenishing stock</TOCLink>
          <TOCLink href="#cost-sync">Cost sync with the Products catalog</TOCLink>
          <TOCLink href="#faq">FAQ</TOCLink>
        </div>
      </div>

      <Section id="adding-a-part" title="Adding a part">
        <p>
          <strong>CMMS → Parts → “+ New Part.”</strong> The fields that matter most up front:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">What it’s for</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {NEW_PART_FIELDS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A part isn’t useful on its own — the next two steps are linking it to the assets that use
          it, and (if it’s purchasable) confirming its Products catalog entry, which is what every PO
          line item actually references.
        </p>
      </Section>

      <Section id="assets-many-to-many" title="Parts ↔ Assets: why it’s many-to-many">
        <p>
          A part and an asset are linked through a join — not by putting an asset on the part. That
          matters because the real world isn’t one part per machine: an oil filter, a belt, or a spark
          plug is very often the exact same part number across several different mower or truck
          models. One <code>parts</code> row should represent that one physical part, and it should be
          linkable to every asset that actually uses it.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            In the part detail, the <strong>Assets tab</strong> is where you manage those links — add
            Mower #3, add Mower #7, add the walk-behind trimmer, whatever else takes the same filter.
          </li>
          <li>
            Each asset, in turn, shows this part on its own “parts typically used” list — so a tech
            opening Mower #7’s asset record sees Oil Filter — OEM 51515 without anyone having entered
            it twice.
          </li>
          <li>
            One quantity on hand, one reorder point, one purchase history — shared correctly across
            every asset that draws from it, instead of fragmented into duplicate part records per
            machine.
          </li>
        </ul>
        <Callout>
          A part never stores which asset it belongs to directly — that would only allow one asset per
          part. The relationship is many-to-many, so linking (and unlinking) is always done from the
          Assets tab on the part, not by editing an asset_id field on the part itself.
        </Callout>
      </Section>

      <Section id="vendors" title="Vendors on a part">
        <p>
          A part can list a <strong>primary vendor</strong> plus one or more{" "}
          <strong>alternate vendors</strong> it’s also sourced from. This is purely a reference and
          reordering convenience — it does not split the part into separate catalog entries, and it
          does not change which Products entry a PO line item points at. Use it when the exact same
          physical part is available from more than one supplier and you just want the options on
          hand when it’s time to reorder.
        </p>
      </Section>

      <Section id="lifecycle-example" title="Worked example: one part, start to finish">
        <p>
          Following one part through its full lifecycle — creation, asset linking, a low-stock alert,
          the requisition it triggers, and the receipt that closes the loop:
        </p>
        <Table>
          <tbody>
            {LIFECYCLE_STEPS.map(([step, desc]) => (
              <tr key={step} className="border-b border-[#eceae3] last:border-0">
                <td className="w-48 whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">
                  {step}
                </td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          Nowhere in this flow does anyone manually type in a new quantity on hand. The only inputs
          are the starting count at creation and whatever a Goods Receipt adds — that’s what keeps the
          number trustworthy.
        </Callout>
      </Section>

      <Section id="interchangeable-parts" title="Interchangeable parts: split vs. alternate vendor">
        <p>
          Not every alternate source is the same part. If a part number is genuinely
          interchangeable across brands — a name-brand filter and an aftermarket equivalent that fits
          the same spec — keep them as <strong>two separate catalog entries</strong>, not one part
          with a second vendor. They don’t share a cost history or a vendor history, and PO line items
          need to attach to the correct one for that history to mean anything.
        </p>
        <p>
          <strong>Worked example.</strong> Say “Oil Filter — OEM 51515” has been the only entry, but a
          tech starts also buying a cheaper aftermarket filter that physically fits the same mowers:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Create a second part — e.g. “Oil Filter — Aftermarket 51515-GEN” — with its own part
            number, its own cost, and its own Products catalog entry.
          </li>
          <li>
            Copy over the Assets links (Mower #3, Mower #7, …) to whichever entry actually fits — both,
            if either filter genuinely gets used on either mower.
          </li>
          <li>
            On either part’s detail page, open <strong>Interchangeable Parts</strong> and click{" "}
            <strong>“Link as alternative part”</strong> (it becomes <strong>“Add Alternative”</strong>{" "}
            once a part already has one or more links), then pick the other part. It doesn’t matter
            which side you start from — either part can link to the other, and neither side is more
            authoritative; the link and its display are identical regardless of direction.
          </li>
        </ol>
        <p>
          Compare that to just adding a second vendor on the existing part (see{" "}
          <a href="#vendors" className="text-[#60ab45] hover:underline">Vendors on a part</a>{" "}
          above) — the right call when it&apos;s the exact same physical part, just available from a
          second supplier. Split into two parts only when the part number, cost, or vendor history
          actually needs to diverge.
        </p>
      </Section>

      <Section id="replenishing" title="Replenishing stock">
        <p>
          To restock a part, create a <strong>Purchase Requisition</strong> using the Maintenance Part
          product that corresponds to it. Once the resulting PO is received in{" "}
          <strong>Purchasing → Receiving</strong>, quantity on hand increments automatically.
        </p>
        <Callout>
          Never adjust quantity on hand manually outside of receiving. Receiving is the single place
          the count changes — a manual edit will drift out of sync with the actual PO/receipt history
          the next time something is received.
        </Callout>
      </Section>

      <Section id="cost-sync" title="Cost sync with the Products catalog">
        <p>
          Every part is linked to a Products catalog entry. When a receipt updates a part’s unit cost,
          the linked product’s cost updates automatically — and the reverse holds too, so a manual
          edit on either side stays in sync. The price shown in CMMS Parts and in Purchasing Products
          should always match for a given part/product pair.
        </p>
        <p>
          How that landed cost is actually calculated — most recent price, weighted average, or
          first-in-first-out — depends on the org’s configured <strong>Costing Method</strong> (Manual
          / WAC / FIFO).
        </p>
      </Section>

      <Section id="faq" title="FAQ">
        <ul className="list-disc space-y-3 pl-5">
          <li>
            <strong>Why does a part’s audit trail show a “name conflict” entry?</strong> The bulk PO
            import keeps the first name it ever saw for a given part number. If a later purchase uses
            a different name for the same part number, the import doesn’t silently overwrite the
            catalog — it records a “name conflict” entry on that part/product’s audit trail for
            review. If a part’s Products catalog name and Parts inventory name genuinely disagree,
            check the Audit Trail before assuming it’s just a typo.
          </li>
          <li>
            <strong>A part number seems to cover two different physical parts — what should I do?</strong>{" "}
            Split it into two catalog entries, one per physical part, with distinct part numbers (e.g.
            append “-OEM”/“-GEN” if the real part number would otherwise collide) so future
            purchases and work-order usage attach to the right one. Copy any Assets already linked to
            the shared part over to whichever new entry actually fits them. Once split, link the two
            as alternatives via Interchangeable Parts.
          </li>
          <li>
            <strong>Does it matter which part I start from when linking two interchangeable parts?</strong>{" "}
            No — whichever side you initiate from is purely which side clicks first. Display is
            identical either way, and neither part is more correct or authoritative than the other.
          </li>
          <li>
            <strong>How do I record goods received against a purchase order?</strong>{" "}
            Purchasing → Receiving → “+ New Receipt.” Maintenance Part lines auto-update CMMS Parts
            inventory quantity on hand.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
