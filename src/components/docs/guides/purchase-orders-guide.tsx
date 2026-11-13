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
  ["Rejected", "An approver rejected it. Reset to Draft to fix and resubmit, or Close it."],
  ["Ordered", "A PO has been created from it (see Converting, below). Goes back to Approved if every PO made from it is deleted or canceled."],
  ["Closed", "Done — set with Close Requisition. No more POs can be made from it and its lines are locked."],
];

const PO_STATUSES: [string, string][] = [
  ["Requested", "Just created. Not yet submitted for approval."],
  ["Pending", "Submitted. Routed through the approval chain."],
  ["Approved", "Chain resolved with no rejection. Ready to mark as ordered."],
  ["Rejected", "An approver rejected it."],
  ["Ordered", "Manually flagged as sent to the vendor — a status label only, no email or PDF is sent."],
  ["Partially Fulfilled", "At least one line item has been received, but not all of it yet."],
  ["Completed", "Fully received — or forced complete anyway (see the Mark Complete callout)."],
  ["Canceled", "Called off with Cancel PO before anything was received. Reset to Requested reopens it."],
];

export function PurchaseOrdersGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Purchasing"
        title="Purchase Orders, Requisitions & Receiving"
        description="The full procurement path in one place — requesting, converting to a PO, approving, and receiving — plus the exact statuses and a few real footguns along the way."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
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
          <TOCLink href="#spend-reports">Spend and repair cost reports</TOCLink>
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
          A Requisition and the PO it produces are two separate records, and the new PO always
          starts at Requested. When you submit a PO made from an approved requisition, it is
          approved straight away if the requisition already covers it (see{" "}
          <strong>How approval actually works</strong>); otherwise it goes through the PO approval
          chain like any other PO.
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
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          From Rejected, click <strong>Reset to Draft</strong>, make your changes, and submit again.
          A resubmitted requisition starts the whole approval chain over: approvals given before
          the rejection don&apos;t carry over, so every step is asked again.
        </p>
        <p>
          <strong>Close Requisition</strong> (shown on Approved, Ordered and Rejected requisitions)
          marks it finished: no more purchase orders can be made from it and its lines can&apos;t be
          edited. Purchase orders already made from it aren&apos;t affected.
        </p>
      </Section>

      <Section id="editing" title="Editing after creation">
        <Callout>
          <strong>The pencil-edit button never touches line items.</strong> Editing an existing
          Requisition or PO through its header Edit button only changes Title/Vendor/Notes (or PO
          Date/Payment Type/Invoice #) and Tax/Shipping/Discount — the line-items table isn&apos;t
          even shown there. To add, edit, or remove a line item, use the <strong>Line Items</strong>{" "}
          section on the record&apos;s own detail page instead.
        </Callout>
        <Callout>
          <strong>Once a Requisition or PO is Ordered, only admins can edit its lines.</strong>{" "}
          For everyone else the Line Items table turns read-only after ordering (and, for POs,
          through Partially Fulfilled, Completed, and Canceled). Managers are no longer exempt —
          if a manager needs a line changed on an ordered record, an admin has to make the edit.
        </Callout>
        <Callout>
          <strong>A PO line can&apos;t be lowered below what&apos;s already been received.</strong>{" "}
          If goods receipts already recorded 10 of a line, its quantity can&apos;t be cut under 10
          &mdash; correct the goods receipt first. Likewise a <strong>PO with goods received
          can&apos;t be deleted or canceled</strong> (the stock it added would have nothing to trace
          to) &mdash; use <strong>Mark Complete</strong> to close it short instead, and a{" "}
          <strong>Requisition that already has purchase orders can&apos;t be deleted</strong>{" "}
          &mdash; use <strong>Close Requisition</strong>.
        </Callout>
        <Callout>
          <strong>A PO line that was received into stock can&apos;t be deleted directly.</strong>{" "}
          Edit its goods receipt and set the received quantity to 0 first &mdash; that takes the
          units back out of stock &mdash; then delete the line. The same applies to deleting a
          receipt: a receipt whose units went into stock can only be corrected, not removed, so the
          same delivery can never be received twice.
        </Callout>
        <Callout>
          <strong>Any change to the lines or vendor of a pending or approved record sends it back
          through approval.</strong> Adding, removing or editing a line (product, quantity, unit
          cost, taxable flag or project), or picking a different vendor, on a Requisition or PO
          that&apos;s Pending Approval or Approved re-submits it &mdash; you&apos;ll see a toast
          (&ldquo;re-submitted for approval&rdquo;). An approval only counts for exactly what the
          approver saw, so every approver whose approval no longer matches is asked again, even if
          the total went down. Changing only tax rate, shipping or discount re-asks approval only
          when the total goes up. Once a record is Ordered, only an admin can change its vendor.
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
          If a split fails partway (say the first vendor&apos;s PO was created but the second
          wasn&apos;t), you can close the dialog and reopen it, then retry — it recognizes the POs
          already created for that requisition and only creates the missing ones instead of
          duplicating the first.
        </p>
        <p>
          Its own line items are never modified by converting. If every PO made from a requisition
          is later deleted or canceled, the requisition goes back to <strong>Approved</strong> (with
          the same approved total) so you can make a new PO from it; reopening one of those POs
          with Reset to Requested moves the requisition back to Ordered. A Closed requisition is
          never reopened this way.
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
        <p>
          <strong>Discount reduces tax.</strong> When this box is ticked the discount comes off
          before tax, spread across the taxable and non-taxable lines by their share of the
          subtotal &mdash; only the taxable lines&apos; share lowers the amount taxed. Example: a
          $1,000 PO with $800 of taxable lines and a $100 discount taxes $800 &minus; $80 = $720.
          With the box unticked, the full taxable amount is taxed and the discount comes off the
          total afterward. The PO screen, the PDF and the saved totals all use this same rule.
        </p>
        <p>
          The New Purchase Order form also shows a read-only <strong>Part #</strong> column beside
          each line&apos;s item, filled in from the catalog entry (a dash if it has none), so you
          can check the part number without leaving the form. The New PO and Receive Goods dialogs
          are wider than they used to be so every column fits.
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
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
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
            Managers can stand in for another approver on a step, but only on non-admin steps. A
            step whose Required Role is <em>admin</em> can only be decided by an admin (or the
            admin it was assigned to) — a manager doesn&apos;t see the override option there, and
            the server rejects it if attempted.
          </li>
          <li>
            Only the approver whose turn it currently is can act — trying to approve or reject out
            of turn is rejected server-side with &ldquo;It&apos;s not your turn to approve this yet
            — an earlier step is still pending.&rdquo;
          </li>
          <li>
            <strong>A PO made from an approved requisition approves itself when the requisition
            covers it.</strong> On submit, the PO is approved without a chain when every line is a
            line of that requisition (same catalog item and project, at a unit cost no higher than
            requested), the quantities across all open POs made from the requisition stay within
            the requisition&apos;s, and those POs together don&apos;t cost more than the
            requisition&apos;s approved total. Anything else &mdash; an extra item, a higher price,
            more than was requested &mdash; goes through the normal PO approval chain.
          </li>
          <li>
            <strong>Each approval covers what the approver saw.</strong> If the lines or vendor
            change while a record is still going through its chain, the last approval doesn&apos;t
            finish it: earlier approvals that no longer match are asked again, and if the total now
            crosses a higher threshold, that step&apos;s approver is added. The record stays
            Pending until the rebuilt chain is done.
          </li>
          <li>
            <strong>A rejection restarts the chain.</strong> When a rejected record is submitted
            again, every step is asked again &mdash; approvals from before the rejection
            don&apos;t carry over.
          </li>
          <li>
            Approving a record you submitted yourself is allowed when you hold the step&apos;s
            role.
          </li>
          <li>
            <strong>Approval thresholds use the total the system calculates.</strong> A
            requisition&apos;s or PO&apos;s subtotal, sales tax and grand total are always worked out
            from its line items, tax rate, shipping and discount &mdash; whenever a line or one of
            those fields changes, and again at the moment it&apos;s submitted. A total typed or sent
            from anywhere else is replaced, so a record can&apos;t slip under a threshold its lines
            are actually over.
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
          A PO line can never be received past what was ordered in total. Clicking Record twice,
          or receiving the same PO in two tabs, is refused with &ldquo;&hellip; would be received in
          total but only &hellip; was ordered &mdash; check for a duplicate submission&rdquo; instead
          of creating a second receipt. A Maintenance Part with a Parts record is always received
          into that part (the product&apos;s count follows it); the system refuses to add the units
          to the product alone.
        </p>
        <p>
          Recording a receipt does two things, in order: first, inventory updates — quantity on hand
          increases and a new cost layer is appended (see the Inventory Costing Methods guide for how
          that cost is computed) — and only after that succeeds is the receipt itself saved. If a
          line can&apos;t be matched to a catalog product, the whole receipt is rejected with an
          error and never saved.
        </p>
        <p>
          If a Work Order already used some of that part <em>before</em> the stock was received (so
          the Work Order could only take what was on hand, and the Parts list shows a &ldquo;used
          before received&rdquo; badge), recording the receipt settles it: those units come off the
          incoming quantity automatically. A receipt of 3 for a part that two Work Orders had
          already used 3 of leaves quantity on hand at 0, not 3.
        </p>
        <Callout>
          <strong>A receipt is all or nothing.</strong> Every line must match a catalog product
          before anything is recorded. If a line still fails part-way, the lines already added
          come back off stock, Work Order usage they settled goes back to &ldquo;used before
          received&rdquo;, and the receipt is not kept — so you can simply try again. Each receipt
          line can only be added to stock once, the part or product must be the one on the PO line,
          its cost comes from the PO line, and project or Track-inventory-off lines never go into
          stock.
        </Callout>
        <p>
          The status changes the moment the receipt is recorded — you don&apos;t have to click Done
          or keep the page open. Once every line on a PO is fully received, its status automatically moves to{" "}
          <strong>Completed</strong>; if only some lines are fully received, it moves to{" "}
          <strong>Partially Fulfilled</strong> instead. You can correct a receipt you already
          recorded by editing its quantities — the system applies the difference to inventory rather
          than re-receiving from scratch, so lowering a quantity by mistake correctly pulls the stock
          back down too. The PO&apos;s status is worked out from its receipts, so it follows a
          correction as well: lowering a receipt on a Completed PO moves it back to Partially
          Fulfilled (or to Ordered if nothing is left received). That includes a PO you marked
          complete by hand &mdash; any later receipt change re-checks it against what was received.
        </p>
      </Section>

      <Section id="mark-complete" title="The &ldquo;Mark Complete Anyway&rdquo; override">
        <Callout>
          A PO that isn&apos;t fully received still has a way to close it out: clicking{" "}
          <strong>Mark Complete</strong> on an under-received PO asks you to confirm closing it
          short &mdash; the rest won&apos;t be received and parts/inventory won&apos;t be updated
          for it. Use this deliberately (e.g. an order the vendor could only partly fill), not as a
          shortcut to skip receiving.
        </Callout>
        <p>
          <strong>Cancel PO</strong> is for calling off an order before anything arrives. It shows
          on Requested, Pending, Approved, Ordered and Rejected POs that have nothing received yet,
          and asks you to confirm. Once any goods are received the PO can&apos;t be canceled
          &mdash; use Mark Complete to close it short. A canceled PO can be reopened with{" "}
          <strong>Reset to Requested</strong>.
        </p>
      </Section>

      <Section id="spend-reports" title="Spend and repair cost reports">
        <p>
          <strong>Reports</strong> in the Equipt sidebar opens a tabbed page. Two tabs cover
          money spent:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Parts Spend</strong> — spend on catalog items categorized as maintenance parts,
            with a date range picker (Last 6 months, Last 12 months, or All time; default is 12
            months). <strong>Canceled and rejected POs are excluded</strong>, and each PO is
            placed in a month by its PO Date. The cards show Total Parts Spend, Avg Parts PO
            Value, Total POs, and Open POs, followed by a monthly trend and the top 5 vendors. The
            four cards are clickable — each opens the list of line items or POs behind that number
            (for Avg Parts PO Value, the parts-only amounts it&apos;s averaged from).
          </li>
          <li>
            <strong>Repair Cost</strong> — what maintenance actually cost, taken from the lines on
            each work order&apos;s Costs tab: Parts, Labor, and Vendors / Subs, with the same date
            range picker, a Preventive vs. Reactive split, a monthly breakdown, and the top 5 assets by repair spend. Total Repair
            Spend, Parts, Labor, and Vendors / Subs are clickable and open the individual cost
            lines behind them.
          </li>
        </ul>
        <p>
          The Equipt Dashboard&apos;s <strong>Parts Spend MTD</strong> card also shows a smaller{" "}
          <em>repairs MTD</em> figure beneath it — the same repair-cost definition as the Repair
          Cost report, for the current month.
        </p>
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
            <strong>A discount can&apos;t make a total negative.</strong> A discount larger than
            the lines&apos; subtotal is capped at the subtotal, so the most it can do is bring the
            lines to $0 &mdash; tax on any taxable amount left and shipping still apply.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
