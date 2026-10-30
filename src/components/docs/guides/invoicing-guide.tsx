import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";
import { GuideLink } from "@/components/docs/GuideLink";

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
  ["Overdue", "Side state", "Not a stored status — computed on the fly from the due date whenever it's still displayed and unpaid. An invoice on Due on Receipt terms with no due date goes overdue the day after its invoice date. An invoice with a zero or negative balance is never overdue, and neither is one whose balance has been cleared. It disappears the moment the balance clears or you void the invoice, with no cron job flipping a column."],
  ["Void", "Side state", "Set by hand when an invoice should no longer count — a mistake, a client dispute you're not pursuing. Once void, the invoice is excluded from “overdue” and left alone by all the auto-status logic below."],
];

export function InvoicingGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Invoicing & Payments"
        description="How an invoice is born, how its status moves, and where the client's own PO number actually goes."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where-invoices-come-from">Where invoices come from</TOCLink>
          <TOCLink href="#tax-on-auto-invoices">Sales tax on invoices generated from jobs</TOCLink>
          <TOCLink href="#editing-and-sending">Editing and sending an invoice</TOCLink>
          <TOCLink href="#invoice-template-options">Chemical record and technician notes on invoices</TOCLink>
          <TOCLink href="#invoice-photos">Photos on an invoice</TOCLink>
          <TOCLink href="#other-charges">Other charges (late fees, trip charges, surcharges)</TOCLink>
          <TOCLink href="#invoice-list">The Invoices list: columns and filters</TOCLink>
          <TOCLink href="#status-lifecycle">Invoice status lifecycle</TOCLink>
          <TOCLink href="#merge-consolidate">Merging and consolidating invoices</TOCLink>
          <TOCLink href="#recording-payments">Recording payments</TOCLink>
          <TOCLink href="#partial-payment-example">Worked example: a partial payment</TOCLink>
          <TOCLink href="#money-limits">Discounts, tax rate, and quantity limits</TOCLink>
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
            <br />
            <strong>Materials ride along too.</strong> Any Product added to the job that&apos;s
            still <strong>Pending</strong>, or that a crew already marked <strong>Used</strong> in
            the field (inventory decremented, but not yet billed), gets swept onto this same
            invoice as its own line and flipped to <strong>Invoiced</strong> so a later visit on
            the same job can&apos;t bill it again. A product marked <strong>Used, not billed</strong>
            {" "}is deliberately skipped — that status exists for materials the crew used but
            shouldn&apos;t be charged for.
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
          compute — see <GuideLink className="underline" href="/settings/support/snow-guide">Snow Invoicing</GuideLink>.
        </Callout>
              <p>
          Shared stops bill once. When two crews work the same stop (Dispatch Board guide: &quot;Two crews on one stop&quot;), only the lead crew&apos;s visit creates the invoice. The added crew&apos;s visit carries no revenue and its Invoice button is hidden; if you try to invoice it by another route you&apos;re pointed to the lead&apos;s invoice.
        </p>
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
            <strong>Every line bills a service.</strong> Each line has a service dropdown, and Save is
            refused until every line has one &mdash; there are no free-form lines. The service decides
            where the revenue lands in reports and which commission rate applies (see{" "}
            <GuideLink href="/settings/support/commissions-guide" className="text-[#60ab45] underline">Commissions</GuideLink>
            ). Lines created from visits, estimates and contracts get their service automatically, and a
            line left without one shows in amber. The exception is an{" "}
            <a href="#other-charges" className="text-[#60ab45] underline">other charge</a> (a fee such
            as a late fee), which is labelled &ldquo;Other charge&rdquo; and doesn&apos;t need a service.
          </li>
          <li>
            <strong>Sale type.</strong> The header&apos;s <em>Sale Type</em> (New sale or Renewal /
            existing account) decides which commission rate applies. Left blank, it uses the job&apos;s,
            contract&apos;s or estimate&apos;s, then counts as a new sale.
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
          <li>
            <strong>Where invoice emails go.</strong> If the client has a <strong>Billing
            Email</strong> (Client &gt; Edit &gt; Billing), invoices and account statements go there;
            with none, they go to the primary email. The send dialog pre-fills that address and you
            can still type a different one. If the client&apos;s email has hard-bounced, sending to
            the saved address is refused (&quot;Client&apos;s email address has hard-bounced. Update
            it, or send to a different address.&quot;); typing a corrected address sends normally.
          </li>
          <li>
            <strong>Emailing locks the invoice.</strong> An invoice is locked the moment it is
            emailed, including when you email several at once from the Invoices list, so the amounts
            the client received can&apos;t be edited underneath them. Unlock it first to change it.
            A locked invoice can&apos;t be deleted until you unlock it, and an invoice with payments
            applied can&apos;t be deleted at all: the check runs before anything is changed, so a
            refused delete leaves the invoice exactly as it was.
          </li>
          <li>
            <strong>Voiding or deleting an invoice releases its materials.</strong> Job materials
            that the invoice billed go back to Pending (and the stock they used is restored), so they
            can bill again on a replacement invoice instead of staying marked Invoiced against a dead
            one. The voided invoice keeps its lines for the record.
          </li>
          <li>
            <strong>Every issued invoice has a number.</strong> A draft that was never saved (for
            example one started from a job or estimate) is numbered at the moment you email or print
            it, so the client never receives an invoice with no number.
          </li>
          <li>
            <strong>Terms and due date on hand-created invoices.</strong> An invoice you create from
            a job, from an estimate or from scratch takes the client&apos;s default payment terms (the
            organization&apos;s when the client has none) and gets its due date from them, so a Net 30
            client&apos;s invoice is due in 30 days and the past-due reminders fire. A due date you
            type yourself wins.
          </li>
          <li>
            <strong>Percent discounts follow the line.</strong> A line discount entered as a percent
            stays that percent when you change the quantity or rate, rather than freezing at the old
            dollar amount; a flat-dollar discount stays put but can&apos;t exceed the line total. The
            on-screen totals are calculated the same way Save stores them, and Enter Payment always
            offers the invoice&apos;s current balance with a fresh method, date and reference.
          </li>
          <li>
            <strong>The online invoice page.</strong> The client&apos;s link always shows the
            invoice. When it can be paid it has a Pay button; otherwise a note replaces the button:
            &quot;This invoice has been voided&quot;, &quot;This invoice isn&apos;t ready for payment
            yet&quot; (a draft) or &quot;This invoice has no balance due&quot; (paid or zero
            balance). A failed payment attempt shows its error next to the button without hiding the
            invoice.
          </li>
          <li>
            <strong>The manual Invoice buttons won&apos;t double-bill.</strong> The dispatch board&apos;s
            per-visit popup and the job detail page&apos;s Invoice button both check for an existing
            invoice first &mdash; a visit or job that&apos;s already been invoiced shows{" "}
            <strong>View Invoice #N</strong> instead and takes you straight there rather than
            creating a second, duplicate draft.
          </li>
          <li>
            <strong>Products need a Service first.</strong> Adding a Product to a job requires
            picking which of the job&apos;s Services it belongs to &mdash; the same rule Estimates
            already follow. Add Product is disabled (with a hint) until the job has at least one
            Service on it.
          </li>
          <li>
            <strong>Invoice and estimate email templates live in Documents,</strong> not a
            dedicated Email Templates settings page &mdash; Settings still has an Email Templates
            panel, but it&apos;s now just a pointer card to <strong>Documents</strong>, where invoice,
            estimate, client, and chemical-notice templates are all built with the same block
            editor.
          </li>
          <li>
            <strong>Printing several invoices at once produces one PDF.</strong> Selecting multiple
            rows on the Invoices list and choosing <strong>Print Selected</strong> combines them
            into a single multi-page PDF in one tab &mdash; it no longer opens a separate print
            popup per invoice (the same change applies to Estimates&apos; own Print Selected).
          </li>
        </ul>
      </Section>

      <Section id="invoice-template-options" title="Chemical record and technician notes on invoices">
        <p>
          In Settings &gt; Accounting &gt; <em>Invoice Templates</em>, each template has two optional
          checkboxes:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Add chemical application record</strong> adds a Chemical Application Record page
            to the invoice PDF: product, EPA #, ratio, areas, amount, method, targets, re-entry and
            applicator for the visits the invoice bills. Only applications that count as applied
            appear &mdash; a chemical preloaded at the planned amount stays out until the crew or
            office confirms it. Used on the emailed PDF too.
          </li>
          <li>
            <strong>Include technician completion notes</strong> puts the notes the crew wrote when
            completing each billed visit into the invoice&apos;s Notes section (several visits are
            prefixed with the visit date). Customers will see exactly what the crew wrote, so leave
            it off unless your crews write customer-ready notes.
          </li>
        </ul>
      </Section>

      <Section id="invoice-photos" title="Photos on an invoice">
        <p>
          You can attach photos to an invoice — a before/after of the work, a damaged item, proof
          of service. Attached photos print on extra pages at the end of the invoice PDF and show
          as a gallery on the client&apos;s online invoice page.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Where to add them.</strong> Open the invoice&apos;s <strong>Photos</strong>{" "}
            tab, or expand <strong>Photos to include (PDF and online invoice)</strong> in the
            email dialog so you can pick them at send time. Both are the same list.
          </li>
          <li>
            <strong>Three sources.</strong> <strong>Add from job / visit photos</strong> shows
            photos from this invoice&apos;s visits and jobs, plus Job Photos jobs linked to the
            client or project. A Job Photos job created with only a customer name won&apos;t be
            linked, so use the picker&apos;s search box (or <strong>Use client name</strong>).{" "}
            <strong>Upload</strong> adds new images straight from your computer or phone.
          </li>
          <li>
            <strong>Captions and removal.</strong> Each photo has an optional caption, and the
            trash icon removes it from the invoice (the original job or visit photo is untouched).
          </li>
          <li>
            <strong>Limits.</strong> Up to <strong>12 photos</strong> per invoice, images only
            (videos and PDFs stored with job photos aren&apos;t offered). iPhone HEIC photos are
            converted to JPEG automatically, and large phone photos are shrunk before upload.
            Only JPEG and PNG print in the PDF, and very large photos may be left off the PDF to
            keep it small enough to email &mdash; they still show on the online invoice page.{" "}
            <strong>Print Selected</strong> (bulk print) leaves photos out.
          </li>
          <li>
            <strong>Who can edit.</strong> Attaching, captioning, and removing needs the
            permission to send invoices or to add/modify invoices.
          </li>
        </ul>
      </Section>

      <Section id="other-charges" title="Other charges (late fees, trip charges, surcharges)">
        <p>
          Other charges are a catalog of standard fees you add to invoices &mdash; a late fee, trip
          charge, fuel surcharge, returned-check fee and so on. They&apos;re separate from services, so
          they don&apos;t need a service and don&apos;t earn commission.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Set them up</strong> in Settings &gt; Accounting &gt; <em>Other Charges</em>. Each has
            a name, a description (what prints on the invoice), an amount, and a Taxable switch. The
            amount is either a <em>Fixed $</em> figure or a <em>% of invoice</em> (a 4.5% fuel
            surcharge, say). Turn a charge off to stop offering it without losing the invoices it&apos;s already on.
          </li>
          <li>
            <strong>Starting from scratch?</strong> While the list is empty, click{" "}
            <em>Add common charges</em> to add nine standard fees (Bond Fee, Credit Card Processing
            Fee, Fuel Surcharge, Interest, Late Fee, Local Agency Fee, Permit Fee, Returned Check Fee,
            Trip Charge) at $0.00, not taxable. Set the amounts you actually charge and delete or
            turn off the ones you don&apos;t.
          </li>
          <li>
            <strong>On one invoice</strong>, open <em>Add Line Item</em>; active charges are listed under
            an <em>Other Charges</em> heading below your services. The line is a normal line &mdash; edit
            its amount, quantity or taxable flag like any other. Changing the catalog later never
            changes lines already on invoices. A percent charge is worked out when you add it, from
            that invoice&apos;s service lines (each line after its own discount; other charges and the
            invoice discount aren&apos;t counted), and the line prints with the percent, e.g.
            &ldquo;Fuel Surcharge (4.5%)&rdquo;. It&apos;s a fixed dollar line from then on &mdash; it
            doesn&apos;t change if you edit the services afterwards. With no service lines yet there&apos;s
            nothing to take a percent of, so it isn&apos;t added.
          </li>
          <li>
            <strong>On many invoices at once</strong>, tick them in the Invoices list and choose
            Actions &gt; <em>Add Other Charge&hellip;</em>. Pick the charge, adjust the amount or percent if this
            run needs a different one (it must be more than zero), and it&apos;s added to every selected
            invoice and their totals recalculated. A percent charge is worked out separately on each
            invoice, so every invoice gets its own dollar figure; invoices with no service lines are
            skipped. Locked and void invoices are skipped, and the result tells you how many were.
            You need the <em>Add / modify invoices</em> permission.
          </li>
        </ul>
      </Section>

      <Section id="invoice-list" title="The Invoices list: columns and filters">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Columns menu.</strong> Besides the usual Invoice #, Status, Client, dates,
            Total, and Balance, you can show <strong>Account Balance</strong> (the client&apos;s
            true balance, net of credits and prepayments &mdash; green when the client is in
            credit), <strong>Prepay</strong>, <strong>Credits</strong> (hidden until you turn it
            on), <strong>Payment type</strong>, <strong>Sent / Printed</strong>, and{" "}
            <strong>Frequency</strong>.
          </li>
          <li>
            <strong>Sent / Printed</strong> shows where each invoice stands on getting to the
            client: a draft shows the queue it&apos;s waiting in (To Email, To Print, or To Email
            &amp; Print, from the client&apos;s invoice-delivery preference); anything issued shows
            Sent or Printed.
          </li>
          <li>
            <strong>Frequency</strong> is the contract billing cadence (Weekly, Bi-weekly,
            Monthly, Quarterly, Annual); an invoice not tied to a contract reads One-time.
          </li>
          <li>
            <strong>Payment type</strong> shows Credit Card or ACH when the client has an autopay
            card or bank account saved (that&apos;s what puts the invoice in the To Charge queues),
            otherwise the invoice&apos;s own preferred method, then the client&apos;s default.
          </li>
          <li>
            <strong>Filters.</strong> Click a filter label above the table. <strong>Date</strong>{" "}
            takes a from/to range (either end can be left open), <strong>Balance</strong> takes
            At least / At most / Exactly with a dollar amount, and{" "}
            <strong>Status</strong> and <strong>Payment type</strong> are pick-from-list. The
            Status filter matches what the Status column shows, so a past-due Sent invoice is
            found under Overdue.
          </li>
          <li>
            <strong>Sorting and layout.</strong> The list opens sorted by invoice number, and
            Status, Account Balance, Prepay, Credits, Payment type, Sent / Printed, and Frequency
            can be sorted too. The table fills the page width, and row actions appear over the
            right edge of a row on hover instead of taking their own column.
          </li>
        </ul>
        <p>
          The Payments page uses the same range filter: filter by <strong>Date</strong> with a
          from/to range. It opens on <strong>Last 30 Days</strong>; the <strong>All</strong> tab
          shows every payment regardless of age, and <strong>Deleted</strong> shows removed
          payments. Searching or filtering on a column also looks past the 30-day window, so an
          older payment is never hidden from a search.
        </p>
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
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{kind}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
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
        <Callout>
          <strong>Paid and Partial follow recorded payments.</strong> You can&apos;t set an invoice to
          Paid (from its status menu or the bulk <strong>Mark as Paid</strong> action) while its
          balance is still owed &mdash; the app tells you to record a payment instead, so the
          balance, the client&apos;s Account Balance and the charge queues stay correct. Likewise an
          invoice with payments recorded can&apos;t be moved back to Draft or Sent.
        </Callout>
      </Section>

      <Section id="merge-consolidate" title="Merging and consolidating invoices">
        <p>
          On the Invoices list, tick two or more invoices and choose{" "}
          <strong>Merge / Consolidate Invoices</strong> from the actions menu. What happens depends
          on whose invoices you picked.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Same client (merge).</strong> You pick one invoice to keep; the others&apos; line
            items move onto it and they&apos;re voided. Locked invoices can&apos;t be merged.
          </li>
          <li>
            <strong>Sub-accounts of one parent (consolidate).</strong> To bill a property manager for
            several properties together, select the invoices from the sub-accounts and choose
            the same action. It creates one <strong>new invoice on the parent account</strong>. Each line is
            tagged with its sub-account name in brackets, so the customer can see which property it
            belongs to. Every line keeps the tax it was already charged, so sub-accounts with different
            tax rates stay correct (the invoice&apos;s tax rate shows a blended figure when they differ).
            The original invoices are voided and linked to the new one. The new invoice starts as a
            draft: review it, then print or send it like any other.
          </li>
        </ul>
        <p>
          Consolidating is blocked for locked invoices, invoices already synced to QuickBooks, invoices
          with a bank payment still processing or an open dispute, and invoices where a{" "}
          <em>sub-account</em> has already made a payment (a payment stays with the account that made
          it). Payments the parent made, such as one check covering several properties, move onto the
          new invoice.
        </p>
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
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
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
          <strong>Enter Payment records; Collect Payment charges.</strong> The invoice&apos;s{" "}
          <strong>Enter Payment</strong> dialog only <em>records</em> money you already received —
          a check, cash, or a card swiped on a separate terminal. Choosing a credit card or ACH
          method there does not charge anything. To actually charge a card or bank account, use{" "}
          <strong>Collect Payment</strong>, which is available once Stripe is connected under
          Settings &gt; Accounting (ACH also needs the ACH setting turned on). When Stripe is
          connected, Enter Payment also offers a <strong>Charge a card or bank account
          instead</strong> shortcut that opens Collect Payment; when it isn&apos;t, the dialog says
          so.
        </p>
        <p>
          <strong>Changed the invoice total after opening Collect Payment?</strong> The dialog
          always charges the invoice&apos;s balance as of when you click <strong>Continue</strong>.
          If you close it and edit the invoice, or the total changes while it&apos;s open, it starts
          over from the new balance. Open it again and the Balance Due shown matches the invoice.
        </p>
        <p>
          <strong>Writing off a balance.</strong> The invoice&apos;s <strong>Enter Payment</strong>{" "}
          dialog offers <strong>AR Write-off (non-cash)</strong> alongside the real payment methods.
          A write-off is capped at the invoice&apos;s balance (&quot;A write-off can&apos;t exceed the
          invoice balance&quot;) and, because no money changed hands, is excluded from every cash
          collected figure — see &quot;What counts as collected&quot; above.
        </p>
        <p>
          <strong>Zero and negative payments are rejected.</strong> A payment amount must be
          greater than $0.00 (&quot;Payment amount must be greater than $0.00&quot;).
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
        <p>
          You don&apos;t have to remember it&apos;s there. Any issued invoice with a balance shows a
          prompt when that client has unapplied money on them — an overpayment, a prepayment, or a
          deposit taken when they accepted a proposal — with an{" "}
          <strong>Apply to this invoice</strong> button. It uses the oldest money first and never
          applies more than the invoice still owes, leaving any remainder for next time.
        </p>
      </Section>

      <Section id="money-limits" title="Discounts, tax rate, and quantity limits">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Discount</strong> can&apos;t be negative and can&apos;t exceed the invoice
            subtotal. Anything higher is clamped to the subtotal when you leave the field, and if
            you remove lines after entering a discount the preview total never goes below zero.
            Tax is calculated after the discount is taken off the taxable lines.
          </li>
          <li>
            <strong>Tax rate</strong> is limited to 0%&ndash;100%.
          </li>
          <li>
            <strong>Line quantities</strong> can&apos;t go below zero. On jobs, a blank, zero, or
            negative quantity falls back to 1.
          </li>
          <li>
            <strong>Voiding.</strong> An invoice with payments applied can&apos;t be voided. The
            Void button is greyed out and hovering it says to refund or unapply the payments
            first. Sent and printed invoices can still be voided.
          </li>
          <li>
            <strong>Disputed invoices.</strong> When a client&apos;s bank opens a chargeback on a
            card payment, the invoice is flagged while the dispute is open: it drops out of the
            To Charge queues, and Charge Saved, Charge All, and the pay links refuse it (&quot;This
            invoice has a payment dispute open. Resolve the chargeback before charging it
            again.&quot;). If the dispute is won the money comes back, so charging again in the
            meantime would collect twice. The flag clears when the dispute closes.
          </li>
          <li>
            <strong>Charge and Void buttons</strong> on the Invoices list, when disabled, show why
            on hover &mdash; for example a card charge or bank debit that&apos;s still processing
            (bank debits take a few business days to settle), or payments that must be
            refunded before voiding.
          </li>
        </ul>
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
          See the <GuideLink className="underline" href="/settings/support/snow-guide">Snow Invoicing guide</GuideLink>{" "}
          for the full walkthrough — this page won&apos;t re-cover it.
        </p>
      </Section>
    </DocsFontScope>
  );
}
