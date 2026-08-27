import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const REQ_STATUSES: [string, string][] = [
  ["Draft", "Being built. Not visible to approvers yet."],
  ["Pending Approval", "Submitted. Routed through the org's configured approval chain."],
  ["Approved", "Chain resolved with no rejection. Can now be converted to a PO."],
  ["Rejected", "An approver rejected it. Only action from here is Reset to Draft."],
  ["Ordered", "A PO has been created from it (see Converting, below)."],
  ["Closed", "Done — no further action expected."],
];

const PO_STATUSES: [string, string][] = [
  ["Requested", "Just created. Not yet submitted for approval."],
  ["Pending", "Submitted. Routed through the approval chain."],
  ["Approved", "Chain resolved with no rejection. Ready to mark as ordered."],
  ["Rejected", "An approver rejected it."],
  ["Ordered", "Manually flagged as sent to the vendor — a status label only, no email or PDF is sent."],
  ["Partially Fulfilled", "At least one line item has been received, but not all of it yet."],
  ["Completed", "Fully received — or forced complete anyway (see the Mark Complete callout)."],
  ["Canceled", "Called off before completion."],
];

export default function PurchaseOrdersGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Purchasing"
        title="Purchase Orders, Requisitions & Receiving"
        description="The full procurement path in one place — requesting, converting to a PO, approving, and receiving — plus the exact statuses and a few real footguns along the way."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#at-a-glance">The three stages, at a glance</TOCLink>
          <TOCLink href="#requisitions">Creating a Requisition</TOCLink>
          <TOCLink href="#req-status">Requisition status</TOCLink>
          <TOCLink href="#editing">Editing after creation</TOCLink>
          <TOCLink href="#converting">Converting to a Purchase Order</TOCLink>
          <TOCLink href="#po-fields">Purchase Order fields</TOCLink>
          <TOCLink href="#po-status">Purchase Order status</TOCLink>
          <TOCLink href="#approval">How approval actually works</TOCLink>
          <TOCLink href="#receiving">Receiving</TOCLink>
          <TOCLink href="#mark-complete">The &ldquo;Mark Complete Anyway&rdquo; override</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="at-a-glance" title="The three stages, at a glance">
        <p>
          Procurement moves through three separate record types, each in{" "}
          <strong>Purchasing</strong> in the sidebar: <strong>Requisitions</strong> (an internal
          request), <strong>Purchase Orders</strong> (the formal order sent to a vendor), and{" "}
          <strong>Receiving</strong> (a read-only ledger of what&apos;s actually arrived — there is
          no &ldquo;+ New Receipt&rdquo; button; every receipt starts from a PO).
        </p>
        <p>
          A Requisition and the PO it produces are two <strong>separate, independently
          approved</strong> records — converting an approved Requisition to a PO does not skip or
          inherit PO-level approval. The new PO always starts fresh at Requested.
        </p>
      </Section>

      <Section id="requisitions" title="Creating a Requisition">
        <p>
          Go to <strong>Purchasing &gt; Requisitions</strong> and click{" "}
          <strong>+ New Requisition</strong>. Fields: Title (required), Vendor (optional unless
          your org&apos;s Required Fields settings make it mandatory), Notes, and a line-items
          table. Each line picks an item from the Products/Parts catalog — quantity, unit cost
          (pre-filled from the catalog using your org&apos;s costing method, editable), an optional
          Project (only offered on Stocked Material / Project Material lines — never on a
          Maintenance Part line), and a computed line total. Tax Rate, Shipping, and Discount apply
          to the whole requisition.
        </p>
        <Callout>
          <strong>A requisition can be submitted with zero line items.</strong> Removing every line
          from the table doesn&apos;t block &ldquo;Create Requisition&rdquo; — you can end up with a
          $0.00 requisition. Nothing stops this today; treat it as a &ldquo;don&apos;t do this,&rdquo;
          not a &ldquo;can&apos;t do this.&rdquo;
        </Callout>
        <p>
          Save as Draft to keep working on it later, or Submit for Approval to route it to the
          first approver in your org&apos;s chain.
        </p>
      </Section>

      <Section id="req-status" title="Requisition status">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {REQ_STATUSES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Rejected has exactly one way forward — <strong>Reset to Draft</strong>. This is a bare
          status change; it doesn&apos;t clear the rejection reason from the approval history or
          restart a chain automatically. You&apos;ll need to submit again once you&apos;re ready.
        </p>
      </Section>

      <Section id="editing" title="Editing after creation">
        <Callout>
          <strong>The pencil-edit button never touches line items.</strong> Editing an existing
          Requisition or PO through its header Edit button only changes Title/Vendor/Notes (or PO
          Date/Payment Type/Invoice #) and Tax/Shipping/Discount — the line-items table isn&apos;t
          even shown there. To add, edit, or remove a line item, use the <strong>Line Items</strong>{" "}
          section on the record&apos;s own detail page instead — it&apos;s editable at any status.
        </Callout>
        <Callout>
          <strong>Editing line items on a pending or approved record silently resubmits it for
          approval.</strong> Change a quantity or add a line on a Requisition or PO that&apos;s
          already Pending Approval or Approved, and it automatically re-runs the full approval
          chain against the new total — you&apos;ll see a toast (&ldquo;re-submitted for
          approval&rdquo;), but an approver who already signed off won&apos;t get any more warning
          than a normal new approval request. This is intentional (the total changed, so it should
          be re-reviewed) but easy to be surprised by.
        </Callout>
      </Section>

      <Section id="converting" title="Converting to a Purchase Order">
        <p>
          Open an <strong>Approved</strong> requisition and click{" "}
          <strong>Convert to Purchase Order</strong>. This opens the New PO form pre-filled with the
          requisition&apos;s vendor and line items — nothing is created until you actually submit
          that form. Submitting creates a brand-new, fully independent Purchase Order (its own PO
          number, starting at status Requested), and the requisition&apos;s status jumps straight to{" "}
          <strong>Ordered</strong> the instant the PO is created, not when the PO is later actually
          ordered or received.
        </p>
        <p>
          If line items span multiple vendors, use <strong>Split by Vendor</strong> instead — it
          groups the requisition&apos;s lines by each item&apos;s catalog vendor and creates one PO
          per vendor group in one action.
        </p>
        <Callout>
          <strong>Only the first PO is remembered.</strong> When Split by Vendor creates several
          POs from one requisition, only the first one is saved to the requisition&apos;s permanent
          record. The others are visible as chips for the rest of that session, but that list won&apos;t
          survive a page reload.
        </Callout>
        <p>
          Nothing locks a requisition after conversion — you can click Convert (or Split) again and
          create additional POs from the same requisition. Its own line items are never modified by
          converting.
        </p>
      </Section>

      <Section id="po-fields" title="Purchase Order fields">
        <p>
          A PO can be created directly (Purchasing &gt; Purchase Orders &gt; + New Purchase Order)
          or arrive pre-filled from a requisition conversion — either way it&apos;s the same form and
          starts at the same status. Fields: Vendor, PO Date (defaults today), Payment Type (Check /
          ACH / Credit Card), Invoice Number, Notes, and line items — same pattern as a requisition,
          plus one addition: each line has a <strong>Taxable</strong> toggle (on by default), letting
          you exempt a specific line — a delivery fee, for example — from sales tax. Requisition
          lines don&apos;t have this toggle; if a requisition is converted, every resulting PO line
          defaults to taxable regardless.
        </p>
      </Section>

      <Section id="po-status" title="Purchase Order status">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {PO_STATUSES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>The visual progress indicator only shows 4 steps</strong> — Requested, Pending,
          Approved, Completed — so Ordered and Partially Fulfilled render at the same step as
          Approved. Only the text status badge actually distinguishes them; don&apos;t expect the
          progress bar itself to show which one you&apos;re in.
        </Callout>
      </Section>

      <Section id="approval" title="How approval actually works">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Requisitions and POs each go through your org&apos;s configured{" "}
            <strong>Approval Flow</strong> independently — see the Approval Flows guide for how a
            chain is built. If no flow is configured for that record type (or the flow has zero
            steps), the record auto-approves immediately.
          </li>
          <li>
            A step with no specific person assigned resolves to <em>every</em> user holding the
            required role — any one of them approving satisfies that step for everyone else at it.
            If nobody in the org holds that role, it silently falls back to the first admin as a
            catch-all.
          </li>
          <li>
            An admin submitting their own requisition/PO automatically clears any
            manager-level step in the chain (the step still shows in history, just marked skipped)
            — admins outrank managers in this flow.
          </li>
          <li>
            Only the approver whose turn it currently is can act — trying to approve or reject out
            of turn is rejected server-side with &ldquo;It&apos;s not your turn to approve this yet
            — an earlier step is still pending.&rdquo;
          </li>
        </ul>
      </Section>

      <Section id="receiving" title="Receiving">
        <p>
          There&apos;s no standalone &ldquo;New Receipt&rdquo; screen — Receiving is a read-only
          ledger you search by receipt #, vendor, or PO #. Every receipt starts from a PO: open one
          with status Ordered or Partially Fulfilled and click <strong>Send to Receiving</strong>.
        </p>
        <p>
          Each line pre-fills with whatever&apos;s still outstanding — ordered minus everything
          already received across any earlier partial receipts on the same PO — so partial receiving
          across multiple deliveries works correctly out of the box. Maintenance Part quantities
          round to whole units; material quantities allow two decimal places. Tax and any PO-level
          discount are prorated onto each partial receipt proportionally, so a discount isn&apos;t
          double-counted across multiple receipts. You must pick a <strong>Received By</strong>{" "}
          person before recording.
        </p>
        <p>
          Recording a receipt does two things, in order: first, inventory updates — quantity on hand
          increases and a new cost layer is appended (see the Inventory Costing Methods guide for how
          that cost is computed) — and only after that succeeds is the receipt itself saved. If a
          line can&apos;t be matched to a catalog product, the whole receipt is rejected with an
          error and never saved.
        </p>
        <Callout>
          <strong>A partially-failed receipt can still update some inventory.</strong> If a
          multi-line receipt fails to match a catalog product on, say, its third line, the first two
          lines&apos; inventory increases already happened and are not rolled back — even though the
          receipt record itself is never created. If a receipt fails, check inventory counts before
          re-submitting to avoid double-counting.
        </Callout>
        <p>
          Once every line on a PO is fully received, its status automatically moves to{" "}
          <strong>Completed</strong>; if only some lines are fully received, it moves to{" "}
          <strong>Partially Fulfilled</strong> instead. You can correct a receipt you already
          recorded by editing its quantities — the system applies the difference to inventory rather
          than re-receiving from scratch, so lowering a quantity by mistake correctly pulls the stock
          back down too.
        </p>
      </Section>

      <Section id="mark-complete" title="The &ldquo;Mark Complete Anyway&rdquo; override">
        <Callout>
          A PO that isn&apos;t fully received still has a way to close it out: clicking{" "}
          <strong>Mark Complete</strong> on an under-received PO opens a confirmation reading{" "}
          <em>&ldquo;Marking this PO complete without receiving it will not update
          parts/inventory. Are you sure you want to mark it complete anyway?&rdquo;</em> —
          confirming closes the PO but silently skips the inventory update for whatever was never
          formally received. Use this deliberately (e.g. an order that was partially canceled by
          the vendor), not as a shortcut to skip receiving.
        </Callout>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>No GL code field exists</strong> on Requisition or PO line items today — if
            you&apos;re looking for GL coding on a purchasing line, it isn&apos;t there yet.
          </li>
          <li>
            <strong>PO/Requisition/Receipt numbers aren&apos;t strictly sequential.</strong> They&apos;re
            generated client-side from a timestamp, not a gapless counter — fine for day-to-day use,
            but don&apos;t treat them as audit-grade sequential IDs.
          </li>
          <li>
            <strong>Requisitions have no per-line taxable flag; POs do.</strong> If you need a
            tax-exempt line, that only becomes possible once it&apos;s a PO line.
          </li>
          <li>
            <strong>Nothing prevents converting the same requisition twice.</strong> Convert or
            Split by Vendor can be clicked more than once, creating extra POs against the same
            requisition — there&apos;s no lock after the first conversion.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
