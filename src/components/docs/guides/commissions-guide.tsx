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

const RULE_ROWS: [string, string][] = [
  ["Scope", "A specific service, a service category, or all services."],
  ["Sale type", "New sales, renewals / accounts, or both."],
  ["Earned", "When the payment is collected, or when the invoice is issued."],
  ["Rate", "A percentage of the pre-tax revenue."],
];

export function CommissionsGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Commissions"
        description="Paying sales reps a percentage of what they sell — plans and rules, how earnings are calculated from invoices and payments, and locking a quarter into a statement."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">How it fits together</TOCLink>
          <TOCLink href="#plans">Plans and rules</TOCLink>
          <TOCLink href="#assign">Assigning reps</TOCLink>
          <TOCLink href="#sale-type">New sale vs renewal</TOCLink>
          <TOCLink href="#earnings">How earnings are calculated</TOCLink>
          <TOCLink href="#statements">Statements</TOCLink>
          <TOCLink href="#limits">What it doesn&apos;t cover</TOCLink>
        </div>
      </div>

      <Section id="overview" title="How it fits together">
        <p>
          Commissions live under <strong>Accounting → Commissions</strong>. A <strong>plan</strong> holds
          rules that set a rate; a rep is <strong>assigned</strong> one or more plans; the{" "}
          <strong>Earnings</strong> tab shows what each rep has earned for a period, calculated live from
          invoices and payments; and a <strong>statement</strong> locks a period for one rep so it can be
          approved and paid.
        </p>
      </Section>

      <Section id="plans" title="Plans and rules">
        <p>
          Create a plan (for example &quot;Outside Sales&quot;) and add rules to it. Each rule has:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Part</th>
              <th className="px-3 py-2">Options</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {RULE_ROWS.map(([part, options]) => (
              <tr key={part} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{part}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{options}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          When more than one rule fits an invoice line, the most specific wins: a service beats a
          category, which beats all services; a sale type beats &quot;New &amp; renewal&quot;. On a tie the
          higher rate is used. Categories are the ones set on each service in the catalog (see{" "}
          <GuideLink href="/settings/support/services-pricing-guide" className="text-[#60ab45] underline">Services &amp; Pricing</GuideLink>).
        </p>
        <p>
          <strong>Example.</strong> Outside Sales: Lawn category, new sales, when paid, 2.5%; Snow category,
          new sales, when paid, 3%; all services, new sales, when paid, 2.5%. Inside Sales &amp; Renewals: all
          services, renewals, when paid, 2%.
        </p>
      </Section>

      <Section id="assign" title="Assigning reps">
        <p>
          Under <strong>Plans &amp; Assignments</strong>, pick an employee, a plan and the date it takes
          effect. A rep can hold several plans at once — for instance outside sales plus renewals. Use{" "}
          <strong>End today</strong> when a plan stops; earnings before that date are unaffected.
        </p>
      </Section>

      <Section id="sale-type" title="New sale vs renewal">
        <p>
          Sale type is set by your office, because only you know whether a one-time job for an existing
          customer should be paid as a new sale. It is on estimates, contracts, jobs (when creating them)
          and invoices. An invoice uses its own sale type first, then its job&apos;s, its contract&apos;s and
          its estimate&apos;s. If none is set it counts as a new sale.
        </p>
      </Section>

      <Section id="earnings" title="How earnings are calculated">
        <p>
          Commission is worked out per invoice <strong>line</strong>, so each service earns at its own
          rate. The rep is the one on the invoice, falling back to the job, contract, estimate, then the
          client&apos;s rep. Revenue is pre-tax: a line&apos;s share of the invoice total, after line discounts
          (invoice-level discounts are spread across the lines).
        </p>
        <p>
          For rules earned <em>when paid</em>, each payment applied to the invoice earns its share on the
          payment date; refunds reduce what was applied. Rules earned <em>when invoiced</em> pay on the
          invoice date for any invoice that has left draft and isn&apos;t void.
        </p>
        <Callout>
          Every invoice line must name a service — that is what lets revenue and commission land in the
          right place. Lines without one show in amber on the invoice, and the Earnings tab warns when
          a period contains any; they only earn under an &quot;All services&quot; rule.
        </Callout>
      </Section>

      <Section id="statements" title="Statements">
        <p>
          On the Earnings tab, <strong>Create statement</strong> freezes a rep&apos;s unclaimed earnings for the
          period. Each earning line can be on only one live statement, so nothing is ever paid twice, even
          when periods overlap. A statement moves Draft → Approved → Paid. <strong>Void</strong> releases its
          lines so they can go on another statement; a paid statement can&apos;t be voided. The period and
          totals are fixed once created, and <strong>View</strong> shows every line behind the total.
        </p>
        <p>
          <strong>Refunds and voids after a statement.</strong> A statement never changes after it is created, so
          if money is later refunded, a payment is deleted, or an invoice is voided or edited down, the earlier
          statement keeps its original amount. The shortfall is taken back on the rep&apos;s <em>next</em>
          statement as an <strong>Adjustment</strong> line with a negative amount, at the rate the original line
          earned. It is added once per change: a further refund adds only the extra difference, and if the
          refund is reversed or the invoice un-voided before that statement is created, nothing is deducted. If
          the adjustment is already on a statement and the refund is then reversed, the next statement gets a
          matching positive adjustment. An adjustment is not tied to the period you pick, and a statement can
          be created for an adjustment alone. Voiding a statement releases its adjustments along with its lines.
          Before you create a statement, the rep&apos;s card on the Earnings tab shows <em>Includes $X in
          adjustments for refunds/voids since the last statement</em>, and a Pending adjustments table lists
          each line. On the statement, adjustment lines carry an <strong>Adjustment</strong> badge and a link to
          the invoice, with negative amounts in red. If adjustments outweigh new earnings the statement total is
          negative and is labeled <em>owed back</em>; it is an amount to carry against the rep&apos;s future pay.
        </p>
      </Section>

      <Section id="limits" title="What it doesn&apos;t cover">
        <p>
          Rates are percentages only — there are no flat per-job amounts — and annual bonuses tied to company
          results (for example an NOI target) are not calculated here; track those in your accounting system.
          Reps can see their own statements; plans, rules and everyone else&apos;s earnings need the Commission
          permissions in Settings → Roles (<strong>View</strong> and <strong>Manage</strong>).
        </p>
      </Section>
    </DocsFontScope>
  );
}
