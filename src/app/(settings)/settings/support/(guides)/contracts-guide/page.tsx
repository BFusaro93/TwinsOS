import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const STATUS_FLOW: [string, string][] = [
  ["Draft", "Just created. Nothing has been sent or agreed to yet — safe to edit freely."],
  ["Sent", "The proposal went to the client. Also where a signed contract lands automatically if you edit its price, dates, or line items (see the callout below)."],
  ["Signed", "You (or the client) confirmed the terms. Sets signed_at and signed_by, and fires the “Contract Signed” automation/Zapier trigger."],
  ["Active", "The contract is live and, if Auto Generate is on, eligible for automatic monthly invoicing."],
  ["Expired", "Past its end date. The expiry-warning email/notification fires 3 days before this, for any active, non-auto-renewing contract."],
  ["Cancelled", "Terminated before or at its end date. No further invoices generate."],
];

const BILLING_FREQUENCIES: [string, string][] = [
  ["Weekly", "Short-term or trial arrangements — rare for landscape maintenance, more common for a temporary snow-season add-on."],
  ["Biweekly", "Every-other-week billing cadence, occasionally used for lighter recurring service loads."],
  ["Monthly", "The default and by far the most common — matches how most maintenance and package programs are sold and how the automatic invoicing cron actually runs (see the callout below)."],
  ["Quarterly", "Larger commercial accounts that prefer fewer, bigger invoices instead of a monthly drip."],
  ["Annual", "Prepaid or single-invoice-per-year agreements, e.g. a lump-sum snow contract."],
  ["One-time", "A contract that isn't really recurring — used to formalize terms for a single large job without pretending it repeats."],
];

export default function ContractsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Contracts"
        description="Ongoing billing agreements — monthly amounts, seasonal overrides, sub-properties, and how signing and invoicing actually work."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#what-is-a-contract">What a contract is</TOCLink>
          <TOCLink href="#status-lifecycle">Status lifecycle &amp; signing</TOCLink>
          <TOCLink href="#billing-mechanics">Billing mechanics</TOCLink>
          <TOCLink href="#billing-frequency">Billing frequency options</TOCLink>
          <TOCLink href="#multi-property-example">Worked example: multi-property commercial contract</TOCLink>
          <TOCLink href="#see-also">See also</TOCLink>
        </div>
      </div>

      <Section id="what-is-a-contract" title="What a contract is">
        <p>
          A Contract (Landscapt → Accounting → Contracts) is the ongoing billing agreement behind
          recurring service — a monthly amount, a billing day of month, whether it bills a month
          ahead of service, and whether it renews automatically. It&apos;s separate from a{" "}
          <em>Package</em>, which defines the service cadence template, and from the{" "}
          <em>Invoices</em> the contract actually generates — see the See also section below.
        </p>
        <p>
          Each contract belongs to one client and is built from three pieces:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Invoice line items</strong> — one or more entries pulled from the services
            catalog (or typed as a custom line) that become the description on every invoice this
            contract generates.
          </li>
          <li>
            <strong>A monthly amount grid</strong> — twelve fields, one per calendar month
            (January–December), each independently editable. &quot;Auto Fill&quot; copies January&apos;s
            amount into all twelve if you want a flat rate; otherwise leave months at $0 to skip
            billing entirely in that month.
          </li>
          <li>
            <strong>Billing settings</strong> — billing day of month, whether to bill a month in
            advance, payment type, PO number, and two switches: Auto Generate (eligible for the
            automatic invoicing cron) and Active.
          </li>
        </ul>
      </Section>

      <Section id="status-lifecycle" title="Status lifecycle &amp; signing">
        <p>
          Status is a dropdown on the contract itself — there is no e-signature integration behind
          it. Marking a contract &quot;Signed&quot; is a manual confirmation, not a document that
          gets sent out for a client to click and sign.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">What it means</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATUS_FLOW.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Editing a signed contract un-signs it.</strong> If you change the monthly amount,
          the monthly-amounts grid, the invoice line items, or the start/end dates on a contract
          that&apos;s already Signed, the app automatically reverts its status to Sent and clears
          signed_at / signed_by. The idea: the daily invoicing cron bills off those exact fields,
          so a client&apos;s signature shouldn&apos;t stay attached to terms they never actually
          agreed to. Re-confirm (mark Signed again) after making the change.
        </Callout>
        <p>
          Because the signed-date is a tracked field, it&apos;s also one of the Zapier/automation
          triggers — &quot;Contract Signed&quot; fires the moment a contract&apos;s status is set to
          Signed, which is what makes contract signing a distinct, reportable event rather than
          just a status label.
        </p>
      </Section>

      <Section id="billing-mechanics" title="Billing mechanics">
        <p>
          Two paths create an invoice from a contract, and both use the same logic:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Automatic, via a daily cron.</strong> Every contract that is Active, has Auto
            Generate on, and whose Billing Day of Month matches today (or the last day of the month,
            if the configured day is higher than the month has days) gets an invoice created.
          </li>
          <li>
            <strong>Manual, via the &quot;Create Invoices&quot; bulk action</strong> on the Contracts
            list — select one or more contracts and bill them right now, ignoring their configured
            billing day (but not the active/amount checks below).
          </li>
        </ol>
        <p>Both paths follow the same rules:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            The invoice amount comes from <strong>that calendar month&apos;s</strong> entry in the
            monthly-amounts grid; if a month was never explicitly set, it falls back to the
            contract&apos;s flat monthly amount. A month explicitly set to $0 is skipped — no invoice
            is created for it.
          </li>
          <li>
            <strong>Bill 1 Month in Advance</strong> shifts everything one calendar month forward:
            the invoice is dated and amount-matched to next month instead of the current one. This
            is what lets a contract invoice in, say, late June for July&apos;s service.
          </li>
          <li>
            Idempotency is enforced per contract, per calendar month — a contract already invoiced
            this month is skipped, so re-running the cron or clicking Create Invoices twice can
            never double-bill.
          </li>
        </ul>
        <Callout>
          <strong>Why bill a month in advance?</strong> For recurring service, invoicing after the
          work is done means chasing payment on a moving target — the crew has already spent the
          labor and materials, and now collections is racing next month&apos;s visits. Billing a
          month ahead flips that: the client pays before the month&apos;s visits happen, so a late
          or disputed payment is caught before more service gets delivered on an unpaid account,
          not after. It&apos;s a cash-flow and collections-risk decision, not just a scheduling
          preference.
        </Callout>
      </Section>

      <Section id="billing-frequency" title="Billing frequency options">
        <p>
          Every contract has a Billing Frequency value in the data model — it&apos;s stored, shown
          in Contract reports, and returned by the API — but there is currently no field in the
          Contract dialog to set it; new contracts default to Monthly and it isn&apos;t exposed for
          editing after that.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2">When it makes sense</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {BILLING_FREQUENCIES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>The actual invoicing cadence is monthly, regardless of this field.</strong> Both
          the automatic cron and the manual &quot;Create Invoices&quot; action check the contract
          once per calendar month against a Billing Day of Month — there&apos;s no separate
          weekly/quarterly/annual invoicing path today. If your contract truly bills less often than
          monthly, the practical way to represent that is via the monthly-amounts grid: put the full
          period amount in the one month it should invoice and leave the other months at $0 (see the
          worked example below for the seasonal version of this).
        </Callout>
      </Section>

      <Section id="multi-property-example" title="Worked example: multi-property commercial contract">
        <p>
          A property management company owns 5 sites and wants one contract, one monthly invoice,
          and a summer-heavy price — full mowing season rate April–October, a reduced fall/winter
          rate the rest of the year.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Add each of the 5 sites as a Property on the ONE client record first (More menu → Add
            Property, on the client&apos;s detail page — see the Clients guide, linked below).
            This is a single client billed as one account across multiple addresses, not several
            separate client records — if the sites actually need independent jobs, invoicing, or
            estimates instead of one shared bill, that&apos;s the parent/child client hierarchy
            (sub-accounts) instead, a different feature covered in the Clients guide.
          </li>
          <li>
            Create the contract against that client. In Contract Details, check{" "}
            <strong>Include Sub Properties by Default</strong> — this is on by default and
            documents that the contract covers every property on the client&apos;s account, not
            just one address.
          </li>
          <li>
            Set the invoice line items to the services covered across the sites (e.g. &quot;Weekly
            Mowing — 5 Properties&quot;, &quot;Spring Cleanup — 5 Properties&quot;).
          </li>
          <li>
            In the monthly-amounts grid, enter the <strong>combined total for all 5 sites</strong>{" "}
            in each month — April through October at the full mowing-season rate, November through
            March at the reduced rate. There&apos;s no per-property line-item breakdown on the
            invoice itself; the grid holds one number per month, so that number needs to already be
            the sum across every site the contract covers.
          </li>
          <li>
            Set Billing Day of Month and, if the management company expects to be invoiced ahead of
            each month&apos;s service, turn on Bill 1 Month in Advance.
          </li>
        </ol>
        <Callout>
          <strong>Sub-properties is a billing-scope flag, not an auto-aggregation feature.</strong>{" "}
          Turning it on tells the contract it&apos;s meant to cover every property on the
          client&apos;s account instead of issuing a separate contract per site — but the monthly
          amount you enter is still one flat number per month. It won&apos;t sum up per-property
          pricing for you, so double-check the combined total by hand whenever a property is added
          to or removed from the client.
        </Callout>
      </Section>

      <Section id="see-also" title="See also">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <a href="/settings/support/jobs-packages-guide" className="text-[#60ab45] hover:underline">
              Jobs &amp; Packages
            </a>{" "}
            — a package defines the recurring service cadence and visit counts; a contract defines
            the ongoing billing terms on top of it.
          </li>
          <li>
            <a href="/settings/support/invoicing-guide" className="text-[#60ab45] hover:underline">
              Invoicing
            </a>{" "}
            — what a contract actually produces: the draft invoices created by the cron or the
            manual &quot;Create Invoices&quot; action.
          </li>
          <li>
            <a href="/settings/support/clients-guide" className="text-[#60ab45] hover:underline">
              Clients
            </a>{" "}
            — adding properties to a client, and when to use the parent/child (sub-account)
            hierarchy instead.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
