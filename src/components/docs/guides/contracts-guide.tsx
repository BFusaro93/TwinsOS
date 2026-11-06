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

const STATUS_FLOW: [string, string][] = [
  ["Draft", "Just created. Nothing has been sent or agreed to yet — safe to edit freely."],
  ["Sent", "The proposal went to the client. Also where a signed contract lands automatically if you edit its price, dates, or line items (see the callout below)."],
  ["Signed", "You (or the client) confirmed the terms. Sets signed_at and signed_by, and fires the “Contract Signed” automation/Zapier trigger."],
  ["Active", "The contract is live and, if Auto Generate is on, eligible for automatic monthly invoicing."],
  ["Expired", "Past its end date. The expiry-warning email/notification fires 3 days before this, for any signed or active, non-auto-renewing contract (cancelled, expired and draft contracts get no warning). A retry never posts a duplicate in-app notification."],
  ["Cancelled", "Terminated before or at its end date. No further invoices generate."],
];

const BILLING_FREQUENCIES: [string, string][] = [
  ["Weekly", "Bills every 7 days, counted from the contract’s start date. Billing Day of Month doesn’t apply."],
  ["Biweekly", "Bills every 14 days, counted from the contract’s start date. Billing Day of Month doesn’t apply."],
  ["Monthly", "The default and by far the most common — matches how most maintenance and package programs are sold; bills on the Billing Day of Month. The only frequency with the 12-month grid, so it’s also the one for seasonal contracts whose months bill different amounts."],
  ["Quarterly", "Bills every third month, counted from the contract’s start month, on the Billing Day of Month."],
  ["Annual", "Bills once a year, in the contract’s start month, on the Billing Day of Month — e.g. a lump-sum snow contract."],
  ["One-time", "Bills exactly once, on the first run on or after the start date; once any invoice exists on the contract it never bills again."],
];

export function ContractsGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Contracts"
        description="Ongoing billing agreements — monthly amounts, seasonal overrides, sub-properties, and how signing and invoicing actually work."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#what-is-a-contract">What a contract is</TOCLink>
          <TOCLink href="#status-lifecycle">Status lifecycle &amp; signing</TOCLink>
          <TOCLink href="#billing-mechanics">Billing mechanics</TOCLink>
          <TOCLink href="#billing-frequency">Billing frequency options</TOCLink>
          <TOCLink href="#ending-contracts">Ending or cancelling a contract</TOCLink>
          <TOCLink href="#templates">Contract templates</TOCLink>
          <TOCLink href="#multi-property-example">Worked example: multi-property commercial contract</TOCLink>
          <TOCLink href="#see-also">See also</TOCLink>
          <TOCLink href="#good-to-know">Good to know</TOCLink>
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
            catalog (or typed as a custom line) that set the wording on every invoice this contract
            generates. Both billing paths use it the same way: the lines become the invoice
            description, and the invoice&apos;s single line item is named after them (several lines
            are joined with commas). With no lines, the contract title is used. The wording is set
            once per contract and is the same on every invoice; only the amount can vary by month.
          </li>
          <li>
            <strong>A billing frequency and amount</strong> — Monthly contracts get a twelve-field
            grid, one per calendar month (January–December), each the amount of that month&apos;s
            invoice. &quot;Auto Fill&quot; copies January&apos;s amount into all twelve if you want a
            flat rate; otherwise leave months at $0 to skip billing entirely in that month. The line
            above the grid shows what the contract bills in a year. Every other frequency (Quarterly,
            Annual, Weekly, Every 2 weeks, One time) has a single <strong>Amount per invoice</strong>{" "}
            field instead &mdash; see <a href="#billing-frequency" className="underline">Billing
            frequency options</a>.
          </li>
          <li>
            <strong>Billing settings</strong> — billing day of month, whether to bill a month in
            advance, payment type, PO number (copied onto every invoice the contract generates, so
            the client&apos;s accounts-payable team can match it), and two switches: Auto Generate
            (eligible for the automatic invoicing cron) and Active.
          </li>
        </ul>
        <p>
          A contract&apos;s end date can&apos;t be earlier than its start date &mdash; a save with
          reversed dates is rejected.
        </p>
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
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Changing a signed contract&apos;s terms flags it &mdash; billing keeps running.</strong>{" "}
          If you actually change the monthly amount, the monthly-amounts grid, the invoice line
          items, the start/end dates, the client, the billing day / frequency, the
          mid-cycle start setting or the storms-outside-the-contract-dates setting on a contract that&apos;s already Signed or Active, the contract
          stays Signed/Active and the daily invoicing cron bills the new terms from then on. A
          &quot;Changed since signed &mdash; needs client approval&quot; banner appears on the
          contract until you click <em>Client approved &mdash; clear flag</em> (which re-stamps the
          signed date). The edit itself is recorded in the Audit Trail tab (the contract&apos;s tabs are Overview, Contract Details, Other Details, Jobs Under Contract, Included Services, Notes, Attachments and Audit Trail). Saving without changing
          any of those values &mdash; say, editing only the title, PO number or sales rep &mdash;
          doesn&apos;t flag anything.
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
            never double-bill. A contract invoice later consolidated or merged into another invoice
            still counts as billed.
          </li>
        </ul>
        <p>
          <strong>Starting mid-cycle.</strong> Each contract has an <em>If Start Is Mid-Cycle</em>{" "}
          setting. <em>Start on first full cycle</em> (the default) simply begins at the next
          regular billing day. <em>Prorate first period</em> also bills the partial stretch from
          the start date to the day before that first billing day, as its own invoice: the
          period&apos;s amount &times; days in the stub &divide; days in the full cycle, rounded to the
          cent (a contract at $1,000 a month starting Oct 20 with billing day 1 bills $387.10 for
          Oct 20&ndash;31, then $1,000 from Nov 1). The invoice line names the stub period and shows
          the formula. It&apos;s generated once &mdash; by the cron or Create Invoices, whichever
          comes first &mdash; and applies to Monthly, Quarterly and Annual contracts (a contract
          starting exactly on a billing day has no stub, and weekly, biweekly and one-time contracts
          never prorate). A monthly contract that starts <em>before</em> its billing day (say Oct 20
          with billing day 25) bills Oct 20&ndash;24 as the stub; quarterly and annual contracts
          starting before their billing day simply bill their first full cycle on that day. Turning
          proration on for a contract that has already started regular billing doesn&apos;t bill a
          stub after the fact. The stub uses the starting month&apos;s entry in the monthly-amounts
          grid when there is one, otherwise the flat amount. The stub invoice is dated no later than the last
          day of its period (the day before the first billing day), not the day it is created, so it never
          shares a date with that billing day&apos;s regular invoice.
        </p>
        <p>
          <strong>Billing in advance with a mid-month start.</strong> With Bill 1 Month in Advance on, a
          contract that starts after this month&apos;s billing day (billing day 1, start Oct 20) is picked up
          on the next run for the month it covers, so its first full month (November) is invoiced instead of
          being skipped until the following billing day.
        </p>
        <Callout>
          <strong>Why bill a month in advance?</strong> For recurring service, invoicing after the
          work is done means chasing payment on a moving target — the crew has already spent the
          labor and materials, and now collections is racing next month&apos;s visits. Billing a
          month ahead flips that: the client pays before the month&apos;s visits happen, so a late
          or disputed payment is caught before more service gets delivered on an unpaid account,
          not after. It&apos;s a cash-flow and collections-risk decision, not just a scheduling
          preference.
        </Callout>
              <p>
          A stop worked by two crews counts as <strong>one</strong> visit used against a contract&apos;s included visits. Both crews&apos; hours still count toward the job&apos;s labor cost.
        </p>
      </Section>

      <Section id="billing-frequency" title="Billing frequency options">
        <p>
          Every contract has a Billing Frequency, and both billing paths (the daily cron and
          Create Invoices) honor it. Set it in the contract&apos;s <strong>Contract Details</strong>{" "}
          tab, at the top of the Invoice Details settings; new contracts default to Monthly. It can
          also be set through the API, the MCP connector and the contract CSV import. It&apos;s shown
          in Contract reports, as the <strong>Frequency</strong> column on the Invoices list, and in
          the contracts list&apos;s Amount column (&quot;$3,000.00 / quarter&quot;).
        </p>
        <p>
          For any frequency other than Monthly, the twelve-month grid is replaced by one{" "}
          <strong>Amount per invoice</strong> field and a line saying when the contract will bill:
          the months for Quarterly and Annual (&quot;Invoices in Jan, Apr, Jul, Oct&quot;, counted
          from the start date &mdash; or the signed or created date when there&apos;s no start
          date), the 7- or 14-day cadence for Weekly and Every 2 weeks, and the first date for One
          time. Settings that don&apos;t apply are hidden: Weekly and Every 2 weeks have no Billing Day
          of Month, Bill 1 Month in Advance or mid-cycle proration, and One time has no Billing Day
          of Month or proration. Switching frequency carries the amount across (a flat monthly grid
          becomes the single amount and back; a seasonal grid is kept as it is). If a non-monthly
          contract created through the API or import had different amounts for some months, the
          dialog says so, and saving replaces them with the one amount.
        </p>
        <p>
          If a billing day is missed (an outage, or the cron failing that morning), the contract is
          billed later in the same period rather than skipped &mdash; for Weekly, Biweekly, Monthly,
          Quarterly and Annual contracts alike, as long as that period hasn&apos;t already been invoiced and the
          contract existed on its billing day. A contract whose client is{" "}
          <strong>cancelled</strong>, <strong>inactive</strong> or <strong>lost</strong> (or deleted)
          stops billing, matching the visits, which also stop; reactivating the client resumes billing
          on the next cycle.
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
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>The amount is per invoice, not per month.</strong> The contract&apos;s monthly
          amount (and each month in the monthly-amounts grid) is what gets charged every time the
          contract bills, at any frequency &mdash; it isn&apos;t annualized or divided. A quarterly
          contract worth $3,000 a quarter should store $3,000, and an annual $12,000 contract
          stores $12,000. Quarterly and annual contracts can&apos;t double-bill: a manual Create
          Invoices click mid-period bills that period and the cron then skips it. Bill 1 Month in
          Advance only applies to monthly, quarterly, annual and one-time contracts.
        </Callout>
        <p>
          <strong>Seasonal contracts with different monthly amounts.</strong> A contract that bills,
          say, April through November at different amounts stays on <strong>Monthly</strong>: enter
          each billed month&apos;s amount in the grid and leave the other months at $0. It sends
          eight invoices a year, each for its own month&apos;s amount. Because no single amount
          describes it, the contracts list, the client&apos;s contract badge and the snow-billing
          contract picker show its yearly total instead &mdash; &quot;$4,100.00 / yr &middot; 8 months
          (varies)&quot;. A seasonal contract with the same amount every billed month reads
          &quot;$500.00 / month &middot; 8 months&quot;.
        </p>
        <p>
          <strong>Exporting.</strong> The contracts list&apos;s Export button writes Billing
          Frequency, Billing Day (blank for weekly, every-2-weeks and one-time contracts), Amount per
          invoice (&quot;varies by month&quot; for a seasonal grid with different amounts) and Yearly
          Total (blank for one-time contracts).
        </p>
      </Section>

      <Section id="ending-contracts" title="Ending or cancelling a contract">
        <p>
          While a contract is Signed/Active its jobs&apos; visits are billed inside the contract
          price and don&apos;t auto-invoice. Once the contract is Cancelled, Expired, switched
          inactive or past its end date, completed visits on its linked jobs bill like normal
          per-visit work, on the client&apos;s usual invoicing frequency. When you cancel or end a
          contract that has linked jobs, the app tells you how many will now bill per visit before
          you confirm.
        </p>
        <p>
          <strong>Cancelling or deleting a contract cancels its upcoming visits.</strong> Visits on
          its linked jobs from today on that are still scheduled or dispatched and haven&apos;t been
          started are marked Cancelled, with a note on each. A visit a crew is clocked in to, and
          visits already skipped or completed, are left as they are. If some visits can&apos;t be
          cancelled you get an error saying how many — cancel those from the Dispatch Board.
        </p>
        <p>
          <strong>Snow contracts and storms outside the dates.</strong> A contract with a linked
          snow job has a <strong>Storms outside the contract dates</strong> setting under its start
          and end dates. With <strong>Bill per event</strong> (the default), a storm visit dated
          before the start date or after the end date is billed per event in Snow Invoicing. With{" "}
          <strong>Included in the contract</strong>, those storms are covered by the contract price
          too (a cancelled, expired or inactive contract still covers nothing).
        </p>
      </Section>

      <Section id="templates" title="Contract templates">
        <p>
          If you set up many contracts the same way — the same name, invoice description lines,
          monthly amounts and billing terms — save that setup as a template instead of retyping it.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Save one.</strong> Fill in the Details tab the way you want it, then click{" "}
            <strong>Save as template</strong> at the top of the tab and give it a name. A template
            stores the contract name, invoice line items, default service, the twelve monthly
            amounts, billing day of month, bill-a-month-in-advance, payment type, auto-generate
            invoices, and include sub-properties. It does <strong>not</strong> store the client, the
            start and end dates, or the billing frequency &mdash; applying a template keeps whatever
            frequency the contract already has.
          </li>
          <li>
            <strong>Use one.</strong> On a new contract, choose it from{" "}
            <strong>Start from a template…</strong>. The form fills in and you can change anything
            before saving.
          </li>
          <li>
            <strong>Editing and deleting.</strong> A contract keeps no link to the template it came
            from, so deleting a template (use <strong>Delete template</strong> after picking it)
            never changes existing contracts.
          </li>
        </ul>
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
            <GuideLink href="/settings/support/jobs-packages-guide" className="text-[#60ab45] hover:underline">
              Jobs &amp; Packages
            </GuideLink>{" "}
            — a package defines the recurring service cadence and visit counts; a contract defines
            the ongoing billing terms on top of it.
          </li>
          <li>
            <GuideLink href="/settings/support/invoicing-guide" className="text-[#60ab45] hover:underline">
              Invoicing
            </GuideLink>{" "}
            — what a contract actually produces: the draft invoices created by the cron or the
            manual &quot;Create Invoices&quot; action.
          </li>
          <li>
            <GuideLink href="/settings/support/clients-guide" className="text-[#60ab45] hover:underline">
              Clients
            </GuideLink>{" "}
            — adding properties to a client, and when to use the parent/child (sub-account)
            hierarchy instead.
          </li>
        </ul>
      </Section>
      <Section id="good-to-know" title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Why Create Invoices skipped a contract.</strong> When Create Invoices doesn&apos;t create an invoice it says why: already billed, a draft or unsigned contract, a contract that hasn&apos;t started, a $0 month, not a billing month, or an inactive client.
          </li>
          <li>
            <strong>Prorated first invoice.</strong> The prorated first-period invoice&apos;s due date counts from its own invoice date, so its terms read correctly.
          </li>
          <li>
            <strong>Visit usage.</strong> The Used counts against a contract&apos;s included visits leave out visits on deleted jobs.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
