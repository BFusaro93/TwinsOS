import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const PAYMENT_ENTRY_POINTS: [string, string][] = [
  ["Client Portal", "A logged-in client picks Card or Bank Transfer and pays in-page — no redirect."],
  ["Public pay link", "A one-off shareable link on an invoice; no client login required. Card only."],
  ["Staff-charged", "A team member charges a card from inside an invoice, one invoice or several at once."],
  ["Autopay", "Scheduled/bulk off-session charges against a client's saved payment method."],
];

export default function OnlinePaymentsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Online Payments & Stripe"
        description="How a client actually pays an invoice online, how Stripe Connect keeps every org's money in their own account, and how the platform takes zero cut."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#two-integrations">Two Stripe integrations — don't confuse them</TOCLink>
          <TOCLink href="#connect">Connecting your organization's Stripe account</TOCLink>
          <TOCLink href="#ach">Enabling bank transfer (ACH)</TOCLink>
          <TOCLink href="#how-clients-pay">How a client actually pays</TOCLink>
          <TOCLink href="#fees">Processing fees — you set your own, the platform takes none</TOCLink>
          <TOCLink href="#security">How this is kept secure</TOCLink>
          <TOCLink href="#double-pay">What happens if a client pays twice</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="two-integrations" title="Two Stripe integrations — don't confuse them">
        <Callout>
          This app uses Stripe in <strong>two entirely separate ways</strong>. Your{" "}
          <strong>TwinsOS subscription</strong> (what you pay to use the platform) is billed on a
          completely different Stripe setup than the one this guide covers. This guide is only about
          the <strong>client-facing feature</strong> — your Landscapt clients paying <em>you</em> for
          lawn service invoices. The two never share data or configuration.
        </Callout>
      </Section>

      <Section id="connect" title="Connecting your organization's Stripe account">
        <p>
          Go to <strong>Settings &gt; Accounting</strong> and find{" "}
          <strong>Card Payments (Stripe)</strong>. Connecting takes you through Stripe&apos;s own
          hosted onboarding (a <strong>Standard Connect account</strong>) — only an admin can start
          this. Once complete, payments your clients make land directly in{" "}
          <strong>your own independent Stripe account</strong>, not a TwinsOS-controlled one.
          &ldquo;Manage on Stripe&rdquo; simply opens your normal Stripe Dashboard — it&apos;s your
          account in every sense, TwinsOS is never the merchant of record and never touches the
          funds.
        </p>
      </Section>

      <Section id="ach" title="Enabling bank transfer (ACH)">
        <Callout>
          <strong>Two separate switches both have to be on.</strong> Turning on ACH inside your own
          Stripe Dashboard is <em>not enough</em> — Landscapt has its own independent
          &ldquo;Enable ACH / bank transfer payments&rdquo; checkbox in Settings &gt; Accounting, and
          both it and Stripe&apos;s own bank-payments capability need to be active before clients see
          Bank Transfer as an option. This is a genuinely easy setting to miss.
        </Callout>
      </Section>

      <Section id="how-clients-pay" title="How a client actually pays">
        <p>
          Payment happens through an embedded Stripe form on the page itself — there&apos;s no
          redirect to a separate Stripe-hosted checkout page.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Entry point</th>
              <th className="px-3 py-2">How it works</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {PAYMENT_ENTRY_POINTS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          For the client-facing portal experience in more detail — Outstanding vs. History, one-click
          Pay Now, and the saved-method management flow — see the Client Portal guide&apos;s Billing
          section; this page focuses on the payments plumbing behind it.
        </p>
        <p>
          Once a payment succeeds, Stripe notifies the app automatically (a webhook, not a page
          refresh) — the invoice&apos;s paid amount and balance update, its status moves to Paid or
          Partial, a payment record is created, the client&apos;s running balance is recalculated,
          and it&apos;s logged to the client&apos;s activity timeline. If you have an{" "}
          <em>Invoice Paid</em> automation configured, it fires at this point too.
        </p>
      </Section>

      <Section id="fees" title="Processing fees — you set your own, the platform takes none">
        <p>
          TwinsOS takes <strong>zero cut</strong> of any client payment — every charge is a direct
          charge straight to your own connected Stripe account. What you see charged is entirely a
          fee <em>you</em> configure, in Settings &gt; Accounting, to help cover Stripe&apos;s own
          card-processing rate:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Defaults to on, at 3.5%, only applied to invoices above $500 — all three are adjustable.</li>
          <li>Never applied to Bank Transfer/ACH payments — ACH is fee-free by design.</li>
          <li>Staff can waive it or override it to a flat amount on an individual charge; clients paying through the portal or a public pay link cannot.</li>
          <li>Every fee collected is itemized in its own &ldquo;Credit Card Processing Fees&rdquo; report and rolled into the P&amp;L.</li>
        </ul>
      </Section>

      <Section id="security" title="How this is kept secure">
        <p>
          Because a Standard Connect account is your own fully independent Stripe account, Stripe
          sends the app a signed notification any time something happens on it — but the app also
          double-checks that notification actually belongs to <em>your</em> org&apos;s connected
          account before trusting any of the invoice/client information inside it, closing off a
          class of cross-tenant spoofing that a naive integration would be exposed to. Every payment
          notification is also deduplicated, so a retried delivery can&apos;t double-apply the same
          payment twice.
        </p>
      </Section>

      <Section id="double-pay" title="What happens if a client pays twice">
        <p>
          If a client opens the same pay link or portal page on two devices and both payments
          genuinely go through, the second one isn&apos;t silently lost or double-applied to the
          invoice — the system applies only what&apos;s actually still owed at settlement time and
          records the rest as a credit toward that client&apos;s future invoices. It can&apos;t undo
          a real duplicate charge on the client&apos;s card (that&apos;s a refund conversation), but
          it keeps your books honest either way.
        </p>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Stripe&apos;s own ACH toggle isn&apos;t enough on its own</strong> — see the ACH
            callout above. This is the single most common reason &ldquo;Bank Transfer&rdquo; doesn&apos;t
            show up for a client who should have it.
          </li>
          <li>
            <strong>A refund is a real Stripe refund, not just a bookkeeping flip</strong> — issuing
            one from inside the app actually returns the client&apos;s money through Stripe first,
            then updates the invoice record once Stripe confirms it went through.
          </li>
          <li>
            <strong>Fee waivers and overrides are staff-only.</strong> A client paying through their
            portal or a public link always sees the standard configured fee — they can&apos;t adjust
            or skip it themselves.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
