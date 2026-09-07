import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const PAYMENT_METHODS: [string, string][] = [
  ["Cash", "Paid in person, no processor involved."],
  ["Check", "Paid in person or by mail, no processor involved."],
  ["ACH/E-Check", "Bank-to-bank transfer — either a manual entry, or a real ACH charge through a saved bank account (see Online Payments below)."],
  ["AutoPay", "Recorded automatically when a scheduled autopay charge succeeds — not something you pick by hand."],
  ["Credit Card– Visa / MasterCard / AmEx / Discover", "One method per card network, so reporting can split card volume by network."],
  ["AR Write-off", "Zeroes out a balance you're not going to collect (bad debt) without pretending real money changed hands. Non-cash — excluded from every cash/collected report. Offered in the invoice's Enter Payment dialog as well as on the Payments page, and can never exceed the invoice's remaining balance."],
  ["Other", "Anything that doesn't fit the above — barter, a manual adjustment, etc."],
];

const STATUS_ROWS: [string, string, string][] = [
  ["Draft", "Linear", "Created but not yet sent — either by hand or auto-generated (see below). Fully editable."],
  ["Sent", "Linear", "You emailed or printed the invoice to the client."],
  ["Viewed", "Linear", "The client opened their invoice link. Only reachable once an invoice has actually been shared, so it never appears on an invoice still in Draft."],
  ["Partial", "Linear", "A payment was recorded against the invoice, but the balance is still greater than $0."],
  ["Paid", "Linear", "amount_paid_cents has covered the full total — balance is $0."],
  ["Overdue", "Side state", "Not a stored status — computed on the fly from the due date (or the invoice date, for Due on Receipt terms) whenever it's still displayed and unpaid. It disappears the moment the balance clears or you void the invoice, with no cron job flipping a column."],
  ["Void", "Side state", "Set by hand when an invoice should no longer count — a mistake, a client dispute you're not pursuing. Once void, the invoice is excluded from “overdue” and left alone by all the auto-status logic below."],
];

export default function InvoicingGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Invoicing & Payments"
        description="How an invoice is born, how its status moves, and where the client's own PO number actually goes."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where-invoices-come-from">Where invoices come from</TOCLink>
          <TOCLink href="#tax-on-auto-invoices">Sales tax on invoices generated from jobs</TOCLink>
          <TOCLink href="#editing-and-sending">Editing and sending an invoice</TOCLink>
          <TOCLink href="#status-lifecycle">Invoice status lifecycle</TOCLink>
          <TOCLink href="#recording-payments">Recording payments</TOCLink>
          <TOCLink href="#partial-payment-example">Worked example: a partial payment</TOCLink>
          <TOCLink href="#po-number">The “PO Number” field vs. the PO module</TOCLink>
          <TOCLink href="#online-payments">Online payments (Stripe)</TOCLink>
          <TOCLink href="#snow-invoicing">Snow invoicing</TOCLink>
        </div>
      </div>

      <Section id="where-invoices-come-from" title="Where invoices come from">
        <p>
          Most invoices are never typed from scratch — they&apos;re generated for you, and land in{" "}
          <strong>Draft</strong> waiting for a look before they go out. There are three sources:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>A completed visit, on a job with no contract.</strong> Marking a job visit
            complete drafts an invoice automatically — one line item per service on that visit
            (falling back to a single line from the job&apos;s flat rate if it has no services broken
            out). Recurring, package, and project jobs can rack up many visits, so each one gets
            its own invoice. One-time and waiting-list jobs are guarded so a job whose services
            were split across several visits doesn&apos;t get double-billed once the whole job closes.
            The invoice description follows a fallback chain: the visit&apos;s own override, then the
            job-level override, then the service&apos;s own invoice description, then the plain service
            name.
          </li>
          <li>
            <strong>A contract&apos;s billing cycle.</strong> Any job linked to a contract is billed on
            that contract&apos;s schedule instead — visit completion never invoices it directly. A daily
            cron job checks every active contract with auto-generate on, and creates that month&apos;s
            invoice on its configured <code>billing_day_of_month</code> (clamped to the last day of
            a shorter month). A contract can also bill a month <em>in advance</em>, which shifts the
            invoice&apos;s dated month forward by one. The amount comes from that contract&apos;s per-month
            override if one is set, otherwise its flat monthly amount. This is idempotent — it
            checks for an existing invoice on that contract for the billing month before creating
            another.
          </li>
          <li>
            <strong>Manual creation.</strong> You can always build one by hand from Accounting →
            Invoices, independent of any job or contract.
          </li>
        </ol>
        <Callout>
          <strong>Snow jobs are excluded</strong> from the completed-visit auto-invoice entirely.
          Snow billing runs storm-by-storm on per-inch/hourly rates a flat auto-invoice can&apos;t
          compute — see <a className="underline" href="/settings/support/snow-guide">Snow Invoicing</a>.
        </Callout>
      </Section>

      <Section id="tax-on-auto-invoices" title="Sales tax on invoices generated from jobs">
        <p>
          When a completed visit drafts an invoice, each line item carries a{" "}
          <strong>taxable</strong> flag and the invoice picks a tax rate, so the tax the client
          agreed to on the estimate is the tax that shows up on the bill:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Which lines are taxable.</strong> A job&apos;s services are taxable or not
            according to the service catalog &mdash; unless the job was converted from an estimate,
            in which case they follow the estimate: services converted from an estimate that
            carried sales tax are taxable, and services from an untaxed estimate are not.
          </li>
          <li>
            <strong>Which rate applies.</strong> A job converted from an estimate uses that
            estimate&apos;s tax rate. Any other job uses the client&apos;s default tax rate. Tax is
            computed on the taxable lines only.
          </li>
          <li>
            <strong>Appending visits to an open draft.</strong> If a client is billed monthly and a
            second completed visit lands on an already-open draft, the draft&apos;s tax is recomputed
            from all of its taxable lines at the invoice&apos;s rate &mdash; the appended visit is taxed
            too, not just the first one.
          </li>
        </ul>
        <Callout>
          <strong>Why this matters.</strong> An accepted estimate for $1,908 plus $119.25 tax should
          produce a $2,027.25 invoice. If a job&apos;s invoice comes out with no tax line, check that the
          estimate it was converted from actually had a tax rate set, and that the client has a
          default tax rate for jobs that weren&apos;t estimated.
        </Callout>
      </Section>

      <Section id="editing-and-sending" title="Editing and sending an invoice">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>No blank line items.</strong> An invoice can&apos;t be saved with only empty
            lines &mdash; Save is refused with &quot;Add at least one line item with a description or
            amount before saving this invoice.&quot; Every line that&apos;s kept needs a description or
            an amount; rows you added and left blank are dropped.
          </li>
          <li>
            <strong>Abandoned new invoices don&apos;t linger.</strong> Opening New Invoice creates a
            draft immediately so you can start adding lines; if you close the sheet without saving
            anything, that empty draft is removed rather than left on the client&apos;s Uninvoiced
            list.
          </li>
          <li>
            <strong>Undeliverable email addresses.</strong> If the mail provider rejects the
            client&apos;s address when you email an invoice (a malformed or unroutable address, a
            rate limit, a provider outage), the error you see is the provider&apos;s own reason
            &mdash; not a generic &quot;failed to send&quot; &mdash; so you can tell a typo in the
            client record apart from a problem on the sending side.
          </li>
        </ul>
      </Section>

      <Section id="status-lifecycle" title="Invoice status lifecycle">
        <p>
          Five statuses form a straight line; two more are side states that sit outside it — they
          describe an invoice&apos;s condition rather than a step it passes through.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">What causes it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATUS_ROWS.map(([name, kind, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#4a4a46]">{kind}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Draft → Sent → Viewed → Partial → Paid is the path a normal invoice walks. Overdue and
          Void can layer on top of (or, for Void, replace) wherever an invoice sits in that line —
          Draft, Paid, and Void invoices are never shown as Overdue no matter how old their due date
          gets.
        </p>
        <Callout>
          <strong>Only issued invoices count.</strong> An invoice is &quot;issued&quot; once it has
          left Draft and isn&apos;t Void — Sent, Viewed, Partial, Paid, or printed. Draft and Void
          invoices are excluded from every revenue and receivables report, dashboard, and KPI
          (Invoiced Revenue, A/R Aging, Invoices with Balances, Sales Tax, P&amp;L, and so on), and
          from a client&apos;s <strong>Account Balance</strong> — the client header shows drafts
          separately as the <strong>Uninvoiced</strong> line instead. The one place drafts appear
          in reporting is the <strong>Income Not Invoiced</strong> report, which exists to list
          them. Practically: a completed visit isn&apos;t revenue on the books until you print or
          send its invoice.
        </Callout>
      </Section>

      <Section id="recording-payments" title="Recording payments">
        <p>
          A payment is its own record — not a field on the invoice — so one payment can be split
          across multiple invoices for the same client in a single entry (useful when a client pays
          one check against several open invoices at once). Each payment stores a{" "}
          <strong>method</strong>:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Notes</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {PAYMENT_METHODS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          <strong>What counts as &quot;collected.&quot;</strong> Payment reports and every
          &quot;Collected&quot; or &quot;Payments&quot; figure (Payment Audit Summary, Invoices
          and Payments, P&amp;L Cash Basis, the Cash Collected KPI, dashboard gauges) count only{" "}
          <em>cash</em> payments: an <strong>AR Write-off</strong> zeroes a balance without money
          changing hands, so it is excluded, and so are account credits applied from a previous
          overpayment. Amounts are also net of refunds — a $500 card payment refunded $100 counts
          as $400 collected. In the Custom Analysis builder the Payments dataset exposes this as
          the Cash Received, Account Credit, and Net Amount (after refunds) columns.
        </p>
        <p>
          <strong>A payment can only be applied to an issued invoice.</strong> Draft invoices are
          still uninvoiced work and Void invoices are dead, so neither appears in the allocation
          list — send or print the draft first, then apply the payment.
        </p>
        <p>
          <strong>Overpayments never push an invoice negative.</strong> A payment applies to an
          invoice only up to that invoice&apos;s remaining balance; anything beyond it stays on the
          payment as <strong>unused credit</strong>. If you type more than the balance into an
          allocation box it&apos;s capped on the spot (&quot;Capped at this invoice&apos;s balance —
          the rest stays as unused credit&quot;). An $80 check against a $55 invoice marks the invoice
          Paid at $55 and leaves $25 unused; that $25 shows up on the client as{" "}
          <strong>Credits</strong> and can be applied to a later invoice — it isn&apos;t lost and it
          isn&apos;t reported as &quot;Paid −$80.&quot; The same limits are enforced on the server:
          an invoice can never be allocated more than its total, and a payment can never allocate
          more than its own amount.
        </p>
        <p>
          <strong>Writing off a balance.</strong> The invoice&apos;s <strong>Enter Payment</strong>{" "}
          dialog offers <strong>AR Write-off (non-cash)</strong> alongside the real payment methods.
          A write-off is capped at the invoice&apos;s balance (&quot;A write-off can&apos;t exceed the
          invoice balance&quot;) and, because no money changed hands, is excluded from every cash
          collected figure — see &quot;What counts as collected&quot; above.
        </p>
        <p>
          <strong>Typing amounts.</strong> Currency fields — payment allocations, contract amounts,
          employee rates — keep exactly what you type while you&apos;re in the field and format it
          (e.g. <code>55</code> → <code>$55.00</code>) when you leave it. Nothing is reformatted
          mid-keystroke, so &quot;55&quot; can&apos;t turn into $5.01 on the way in.
        </p>
        <p>
          Applying (or un-applying, if a payment gets
          edited) an allocation goes through a single database function that locks the invoice row,
          recomputes its balance, and derives the new status in one atomic step — so two payments
          landing on the same invoice at nearly the same moment can&apos;t silently overwrite each
          other&apos;s balance update.
        </p>
      </Section>

      <Section id="partial-payment-example" title="Worked example: a partial payment">
        <p>An invoice for a fall cleanup goes out at a $500.00 total.</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Invoice sent:</strong> total $500.00, amount paid $0.00, balance $500.00 —
            status <strong>Sent</strong> (or <strong>Overdue</strong>, once its due date passes
            unpaid).
          </li>
          <li>
            <strong>Client pays $200.00</strong> by check. You record a $200.00 payment allocated
            to this invoice. Amount paid becomes $200.00, balance becomes $300.00 — since the
            balance is still above $0.00, status flips to <strong>Partial</strong>.
          </li>
          <li>
            <strong>Client pays the remaining $300.00.</strong> Amount paid reaches $500.00,
            balance hits $0.00 — status flips to <strong>Paid</strong>.
          </li>
        </ol>
        <p>
          If the client had instead <em>under</em>paid — say $220.00 against that $300.00 remaining
          balance — the invoice would stay <strong>Partial</strong> at an $80.00 balance; a later short
          payment doesn&apos;t skip straight to Paid just because a lot has accumulated. Only a balance
          that reaches exactly $0.00 (or is written off, or the invoice is voided) closes it out.
        </p>
        <p>
          And if the client <em>over</em>paid — a $350.00 check against that $300.00 balance — the
          invoice takes $300.00 and flips to <strong>Paid</strong>; the extra $50.00 stays on the
          payment as unused credit, listed under the client&apos;s Credits until you apply it to the
          next invoice.
        </p>
      </Section>

      <Section id="po-number" title="The “PO Number” field vs. the PO module">
        <Callout>
          <strong>These are two unrelated things that happen to share three letters.</strong> The
          “PO Number” field on an invoice or estimate is a plain free-text field the client&apos;s
          reference number gets typed into — it has no link whatsoever to Equipt&apos;s internal
          Purchase Order module (Requisitions → POs → Receiving).
        </Callout>
        <p>
          <strong>Example.</strong> A commercial property manager emails: “please put PO# 4521 on
          the invoice, our AP system needs it to pay you.” That&apos;s their own internal purchasing
          reference, not anything from your side. You:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open the invoice, edit the <strong>PO Number</strong> field, and type <code>4521</code>.
          </li>
          <li>
            It prints on the invoice PDF (labeled “PO Number” / “PO #” depending on the PDF
            template) so their AP department can match it against their own system.
          </li>
          <li>
            Nothing else happens — no requisition, purchase order, or vendor record is created or
            touched. A job or contract can also carry its own <code>po_number</code>, which flows
            onto invoices generated from it the same way.
          </li>
        </ol>
        <p>
          <strong>If you actually want to know what a job or project cost you</strong> in vendor
          materials — reconciling against real Equipt/PO purchase orders, not a client&apos;s AP
          reference — that&apos;s a different mechanism entirely: assign the PO line item&apos;s{" "}
          <strong>Project</strong> field to the matching CRM Project, rather than trying to tie a
          line item to a specific job or invoice. Cost tracking rolls up at the project level, so
          that&apos;s where to look to see what a project actually cost in purchased materials — not on
          the invoice.
        </p>
        <Callout>
          <strong>FAQ: Does the “PO Number” field on an invoice link to a purchase order in the PO
          module?</strong> No. It&apos;s a free-text field for the client&apos;s own reference number and has
          no connection to Equipt&apos;s internal PO/procurement records.
        </Callout>
      </Section>

      <Section id="online-payments" title="Online payments (Stripe)">
        <p>
          Collecting payment straight from the invoice — a saved card or bank account, Autopay,
          bulk “Charge All” runs, processing fees — is its own workflow, covered in full in the
          in-app <strong>Online Payments (Stripe)</strong> documentation. Short version: connect a
          Stripe Standard account under Settings → Card Payments, save a card or ACH bank account
          per client, and charge it via “Charge Saved” or a fresh entry. Autopay is a separate
          toggle from simply having a saved payment method on file. A processing fee is added
          automatically to card charges (not ACH) and can be waived or overridden per charge; fees
          post to the P&amp;L as “Credit card processing fees” income.
        </p>
        <p>See the Support / Docs section in-app for the full walkthrough.</p>
      </Section>

      <Section id="snow-invoicing" title="Snow invoicing">
        <p>
          Snow jobs don&apos;t go through any of the flow on this page — no auto-invoice on visit
          completion, no contract billing cycle. Snow is billed through its own dedicated flow at
          CRM → Accounting → Snow Invoicing, built around per-inch and per-hour storm rates instead
          of flat job/service pricing.
        </p>
        <p>
          See the <a className="underline" href="/settings/support/snow-guide">Snow Invoicing guide</a>{" "}
          for the full walkthrough — this page won&apos;t re-cover it.
        </p>
      </Section>
    </DocsFontScope>
  );
}
