import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const METHODS: [string, string, string][] = [
  [
    "Manual",
    "Cost stored on a Part or Product is whatever you last typed in — receiving a PO line simply overwrites it with that line's unit cost.",
    "You want full control and don't trust an average to reflect real replacement cost.",
  ],
  [
    "WAC (Weighted Average Cost)",
    "Every receipt is folded into a running quantity-weighted average across all cost layers still on hand.",
    "Prices fluctuate but you want one smooth number for reporting and margin math.",
  ],
  [
    "FIFO (First In, First Out)",
    "New Requisition/PO line pre-fills use the unit cost of the oldest layer with quantity remaining. The stored catalog cost, however, still updates to the last-received price — see the Gotchas section below.",
    "You want new orders priced off what's physically oldest in stock.",
  ],
];

export default function InventoryCostingGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Administration"
        title="Inventory Costing Methods"
        description="How the cost of a Part or Product is tracked as inventory moves in and out — and the one place FIFO doesn't behave quite the way the settings page implies."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#basics">The three methods</TOCLink>
          <TOCLink href="#configuring">Configuring it</TOCLink>
          <TOCLink href="#cost-layers">Cost layers, and what receiving actually does</TOCLink>
          <TOCLink href="#work-orders">Work Order parts consumption</TOCLink>
          <TOCLink href="#projects">Project cost tracking</TOCLink>
          <TOCLink href="#not-the-same">Not to be confused with: Budget Method</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="basics" title="The three methods">
        <p>
          Every org picks one costing method, applied uniformly across both CMMS Parts and
          Purchasing Products — they always share one cost, never two separate figures for the
          same physical item.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">What it actually does</th>
              <th className="px-3 py-2">Best for</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {METHODS.map(([name, does, best]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{does}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{best}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="configuring" title="Configuring it">
        <p>
          Go to <strong>Settings &gt; Equipt Settings</strong> (labeled{" "}
          <strong>Purchasing Settings</strong> for Landscapt-only orgs without the CMMS module) and
          open the <strong>Costing</strong> tab, under &ldquo;Inventory Costing Method.&rdquo; Only{" "}
          <strong>admin</strong> and <strong>manager</strong> roles can see this tab — anyone else
          gets an access-denied screen.
        </p>
        <p>
          Selecting an option takes effect <strong>immediately, org-wide</strong> — the page says so
          directly: &ldquo;Changing the costing method takes effect immediately for new line items.
          Existing Requisitions, Purchase Orders, and Work Orders are not modified.&rdquo; Nothing
          about historical records is recalculated retroactively; only the cost pre-filled on new
          lines going forward changes.
        </p>
      </Section>

      <Section id="cost-layers" title="Cost layers, and what receiving actually does">
        <p>
          Both <code>parts</code> and <code>product_items</code> keep a{" "}
          <code>cost_layers</code> column — a running list of every receipt that&apos;s still
          (partially) on hand, each layer recording its own quantity, unit cost, receipt date, and
          originating PO number. Recording a Goods Receipt runs one atomic database function per
          line (<code>receive_part_quantity</code> / the equivalent product-side RPC) that does all
          of the following in a single row-locked transaction:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Increments <code>quantity_on_hand</code> by the received quantity.</li>
          <li>Appends a new cost layer for this receipt.</li>
          <li>
            Recomputes the stored <code>unit_cost</code>:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>WAC</strong> — recalculated as the quantity-weighted average across every
                layer that still has quantity remaining.
              </li>
              <li>
                <strong>Manual and FIFO</strong> — both simply set <code>unit_cost</code> to this
                receipt&apos;s own line price (the last-received cost). See the Gotchas note below —
                this is the one place FIFO doesn&apos;t do what the name implies.
              </li>
            </ul>
          </li>
          <li>
            If the part is linked to a Products catalog entry (or vice versa), propagates the new{" "}
            <code>unit_cost</code> to that linked row so Parts and Products never disagree.
          </li>
          <li>Writes an audit log entry, including the old → new cost when it changed.</li>
        </ol>
        <Callout>
          <strong>Cost vs. price.</strong> Receiving only ever touches a Product&apos;s{" "}
          <code>unit_cost</code> (what you paid). Its sell <code>price</code> — what a client is
          charged — is a separate field and is never modified by a receipt.
        </Callout>
      </Section>

      <Section id="work-orders" title="Work Order parts consumption">
        <p>
          Adding a part to a Work Order&apos;s Costs tab snapshots the part&apos;s{" "}
          <em>currently stored</em> <code>unit_cost</code> onto that WO line — a flat copy, not a
          live link. Editing the catalog cost later never changes a WO line that was already added;
          the WO line can also be hand-edited afterward, independent of the catalog. Adding the part
          also decrements <code>quantity_on_hand</code> immediately (mirrored onto the linked
          Product), the same way removing/adjusting it moves the number back.
        </p>
        <p>
          There is no variance or write-off concept anywhere in this flow — a WO parts line is
          simply a frozen snapshot at the moment it was added or last edited, with no reconciliation
          against later cost changes.
        </p>
      </Section>

      <Section id="projects" title="Project cost tracking">
        <p>
          A Project&apos;s Materials cost (Purchasing &gt; Projects) is built entirely from{" "}
          <strong>actual transaction-line costs</strong> — the real unit cost recorded on each PO
          line, requisition line, direct materials line, or subcontract cost tied to that project.
          It never pulls a dynamically recomputed catalog WAC or FIFO figure; once a line is saved,
          its cost is fixed, the same &ldquo;snapshot, not live-linked&rdquo; pattern as Work Order
          parts above.
        </p>
      </Section>

      <Section id="not-the-same" title="Not to be confused with: Budget Method">
        <Callout>
          <strong>Two unrelated things share the word &ldquo;costing.&rdquo;</strong> Everything on
          this page is about physical inventory cost —{" "}
          <code>organizations.cost_method</code>. Landscapt&apos;s CRM estimating engine has a
          completely separate <code>crm_services.budget_method</code> setting
          (&lsquo;manual&rsquo; vs. &lsquo;production_rate&rsquo;) that controls how{" "}
          <em>labor hours</em> are budgeted on an estimate — see the Estimates &amp; the Budget
          Engine guide. They&apos;re both casually called &ldquo;costing&rdquo; but are different
          settings on different tables, with no connection to each other.
        </Callout>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>FIFO&apos;s stored cost isn&apos;t always the true FIFO cost.</strong> New
            Requisition and PO lines pre-fill from the oldest layer with quantity remaining, as
            expected. But the catalog&apos;s stored <code>unit_cost</code> — and therefore what a
            Work Order parts line snapshots — is always the <em>last-received</em> price under FIFO,
            not the oldest-layer price. In practice this means a Work Order&apos;s FIFO parts cost
            can differ from a Requisition/PO&apos;s FIFO pre-fill for the same part, even though the
            Settings page describes FIFO as applying uniformly across Requisitions, Purchase Orders,
            and Work Orders.
          </li>
          <li>
            <strong>Switching methods doesn&apos;t rewrite history.</strong> Only new line-item
            pre-fills change; every Requisition, PO, and Work Order line already saved keeps
            whatever cost it recorded at the time.
          </li>
          <li>
            <strong>Decimal quantities are allowed on Products, not Parts.</strong> Product
            quantity-on-hand supports two decimal places (e.g. partial yards or units); Parts
            quantity-on-hand is a whole integer — attempting a fractional receipt against a
            maintenance part is rejected.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
