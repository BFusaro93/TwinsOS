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

const ROW = "border-b border-[#eceae3] dark:border-border";
const CELL_LABEL = "whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100";
const CELL = "px-3 py-2 text-[#4a4a46] dark:text-neutral-300";

export function QuickBooksGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Integrations"
        title="QuickBooks Online Sync"
        description="What Landscapt sends to QuickBooks, when it sends it, and what to do when something doesn't show up."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#what-it-does">What this integration does</TOCLink>
          <TOCLink href="#setup">Connecting, step by step</TOCLink>
          <TOCLink href="#customers">How clients match QuickBooks customers</TOCLink>
          <TOCLink href="#invoices">Invoices</TOCLink>
          <TOCLink href="#payments">Payments, refunds and chargebacks</TOCLink>
          <TOCLink href="#timing">When things sync</TOCLink>
          <TOCLink href="#sync-status">Sync Status and retrying</TOCLink>
          <TOCLink href="#limits">What does not sync</TOCLink>
          <TOCLink href="#disconnecting">Disconnecting or reconnecting</TOCLink>
        </div>
      </div>

      <Section id="what-it-does" title="What this integration does">
        <p>
          The QuickBooks integration keeps your QuickBooks Online books current from Landscapt so you
          don&apos;t enter the same invoice or payment twice. Landscapt sends <strong>customers</strong>,{" "}
          <strong>invoices</strong> and <strong>payments</strong> (including refunds, voids and invoice edits)
          to QuickBooks automatically.
        </p>
        <Callout>
          It is a <strong>one-way</strong> sync: Landscapt writes to QuickBooks, never the other way around.
          Nothing you change in QuickBooks is pulled back into Landscapt, so make invoice and payment changes in
          Landscapt and let them flow across.
        </Callout>
        <p>
          Only records created <strong>after you connect</strong> are sent. Invoices and payments that already
          existed in Landscapt are not backfilled, so QuickBooks never ends up with duplicates of work you already
          entered there by hand.
        </p>
      </Section>

      <Section id="setup" title="Connecting, step by step">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Sign in to Landscapt as an <strong>admin</strong> (only admins can connect or disconnect QuickBooks).
          </li>
          <li>
            Go to <strong>Landscapt Settings → Integrations</strong> (the same card also appears under{" "}
            <strong>Settings → Accounting</strong>) and click <strong>Connect QuickBooks</strong>.
          </li>
          <li>
            Sign in to Intuit, choose the QuickBooks company to connect, and approve access. You&apos;re sent back to
            Landscapt, and the card shows <strong>Connected — your company name</strong>.
          </li>
          <li>
            That&apos;s all the setup there is. From here on, sending an invoice or taking a payment pushes it
            automatically.
          </li>
        </ol>
        <Callout>
          Connect to a <strong>QuickBooks Online</strong> company. QuickBooks Desktop isn&apos;t supported. If the
          card says QuickBooks sync is coming soon, your environment hasn&apos;t been switched on yet — contact
          support.
        </Callout>
      </Section>

      <Section id="customers" title="How clients match QuickBooks customers">
        <p>
          Every Landscapt client becomes one top-level QuickBooks customer. The first time a client needs to be sent,
          Landscapt looks the client up by display name:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">What QuickBooks has</th>
              <th className="px-3 py-2">What happens</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className={ROW}>
              <td className={CELL_LABEL}>A customer with exactly the same name</td>
              <td className={CELL}>The client is linked to it automatically.</td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>No similar customer at all</td>
              <td className={CELL}>A new QuickBooks customer is created from the client&apos;s name, email, phone and billing address.</td>
            </tr>
            <tr>
              <td className={CELL_LABEL}>Only similar names (for example &quot;Pam Trainor&quot; vs &quot;Pamela Trainor&quot;)</td>
              <td className={CELL}>
                Landscapt won&apos;t guess. The invoice shows a sync error until you pick the right customer — open the
                client, find the <strong>QuickBooks</strong> section, click <strong>Sync to QuickBooks</strong>, and
                choose a match or <strong>None of these — create new</strong>.
              </td>
            </tr>
          </tbody>
        </Table>
        <p>
          Commercial parent/child client hierarchies are not mirrored: each client, parent or child, is its own
          top-level customer in QuickBooks.
        </p>
      </Section>

      <Section id="invoices" title="Invoices">
        <p>An invoice is sent to QuickBooks as soon as it leaves draft — emailed, printed, or marked Sent. Drafts are never sent.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">In Landscapt</th>
              <th className="px-3 py-2">In QuickBooks</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Invoice number</td>
              <td className={CELL}>Same number, so you can find it by the number on the invoice.</td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Line items</td>
              <td className={CELL}>
                A line whose name matches one of your services uses a dedicated QuickBooks item for that service
                (created the first time it&apos;s needed). Any other line goes under a shared &quot;Services&quot; item.
              </td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Terms and due date</td>
              <td className={CELL}>
                The terms (for example Due on receipt or Net 30) pass through as the matching QuickBooks term, and the
                due date carries across.
              </td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Discounts</td>
              <td className={CELL}>Sent as a single discount line.</td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Sales tax</td>
              <td className={CELL}>
                QuickBooks calculates tax itself. Landscapt finds or creates a QuickBooks tax code at the invoice&apos;s
                rate (named &quot;Landscapt 6.25%&quot;, for example), marks the taxable lines, and lets QuickBooks work out the
                amount. Landscapt then compares QuickBooks&apos; total to its own and records any difference under Sync
                Status.
              </td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Edits after sending</td>
              <td className={CELL}>
                Saving the invoice, changing a line, the taxable flag, the number, the date or the terms updates the
                same QuickBooks invoice. It doesn&apos;t create a second one.
              </td>
            </tr>
            <tr>
              <td className={CELL_LABEL}>Voiding</td>
              <td className={CELL}>
                Voiding the invoice in Landscapt voids it in QuickBooks. A voided QuickBooks invoice can&apos;t be
                reopened, so un-voiding in Landscapt shows a sync error instead of changing QuickBooks.
              </td>
            </tr>
          </tbody>
        </Table>
        <Callout>
          If you send a draft straight from the status menu, Landscapt first totals the saved lines and assigns the
          invoice number, so QuickBooks receives the right amount and number.
        </Callout>
      </Section>

      <Section id="payments" title="Payments, refunds and chargebacks">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Recorded and online payments.</strong> A payment you enter, and a card or ACH payment collected
            through Stripe (staff charge, autopay, client portal or invoice link), is sent to QuickBooks as a
            payment applied to the invoice. If the invoice isn&apos;t in QuickBooks yet it is sent first.
          </li>
          <li>
            <strong>Split payments.</strong> A payment applied across several invoices becomes one QuickBooks payment per
            invoice.
          </li>
          <li>
            <strong>Reference number.</strong> A check number or reference you enter appears in QuickBooks as the
            payment reference (QuickBooks shortens it to 21 characters).
          </li>
          <li>
            <strong>Refunds.</strong> Refunding a payment in Landscapt voids the matching QuickBooks payment when it is
            refunded in full, or reduces it for a partial refund.
          </li>
          <li>
            <strong>Chargebacks.</strong> When a card dispute takes the money back, the QuickBooks payment is voided or
            reduced the same way.
          </li>
        </ul>
        <p>
          See <GuideLink href="/settings/support/online-payments-guide">Online Payments &amp; Stripe</GuideLink> for how clients pay,
          and <GuideLink href="/settings/support/invoicing-guide">Invoicing</GuideLink> for invoice statuses.
        </p>
      </Section>

      <Section id="timing" title="When things sync">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Timing</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Send, print or mark an invoice Sent</td>
              <td className={CELL}>Immediately.</td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Edit or void a sent invoice</td>
              <td className={CELL}>About two seconds after you stop editing.</td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Take or refund a payment</td>
              <td className={CELL}>Immediately.</td>
            </tr>
            <tr>
              <td className={CELL_LABEL}>Anything that was missed</td>
              <td className={CELL}>
                A safety-net job runs every 15 minutes and catches invoices and payments created or changed outside the
                normal screens — for example by the API, Zapier, or an automation. It leaves anything touched in the
                last 10 minutes alone, and re-tries failed items about once an hour.
              </td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <Section id="sync-status" title="Sync Status and retrying">
        <p>
          Under <strong>Settings → Accounting</strong>, right below the QuickBooks connection, the{" "}
          <strong>Sync Status</strong> panel lists every invoice and payment that failed to sync, with the reason. It
          appears for users with the <strong>QB Reconciliation</strong> permission, and the <strong>Retry</strong>{" "}
          button needs the <strong>QuickBooks Resync</strong> permission.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">You see</th>
              <th className="px-3 py-2">What to do</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className={ROW}>
              <td className={CELL_LABEL}>Client match is ambiguous</td>
              <td className={CELL}>Choose the right customer from the client&apos;s QuickBooks section (see above), then Retry.</td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>QuickBooks totals $X but this invoice is $Y</td>
              <td className={CELL}>
                QuickBooks calculated a different total than Landscapt, usually tax. Check the tax settings on the
                QuickBooks company and the invoice, then fix whichever is wrong.
              </td>
            </tr>
            <tr className={ROW}>
              <td className={CELL_LABEL}>This invoice was voided in QuickBooks and can&apos;t be reopened there</td>
              <td className={CELL}>
                The invoice was voided in QuickBooks directly. Landscapt can&apos;t undo that — create a new invoice
                instead.
              </td>
            </tr>
            <tr>
              <td className={CELL_LABEL}>QuickBooks error or connection expired</td>
              <td className={CELL}>
                Retry. If it keeps failing, disconnect and reconnect to the same QuickBooks company, which refreshes the sign-in.
              </td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <Section id="limits" title="What does not sync">
        <ul className="list-disc space-y-2 pl-5">
          <li>Anything entered or changed in QuickBooks — the sync is one-way.</li>
          <li>Invoices and payments created before you connected (no backfill).</li>
          <li>
            Prepayments and credits that aren&apos;t applied to an invoice, and edits to an existing payment&apos;s
            allocations after it was recorded.
          </li>
          <li>Estimates, contracts, jobs, purchase orders, and vendor bills.</li>
          <li>Per-service income accounts and class/location tracking — services map to QuickBooks items only.</li>
        </ul>
      </Section>

      <Section id="disconnecting" title="Disconnecting or reconnecting">
        <p>
          Click <strong>Disconnect</strong> on the QuickBooks card to stop syncing; Landscapt also revokes its access
          at Intuit. Nothing is deleted in either system, and each client and invoice keeps its record of which
          QuickBooks customer or invoice it was sent to.
        </p>
        <p>
          Reconnecting restarts the &quot;after you connect&quot; cut-off: invoices and payments created while you were
          disconnected are not sent automatically. Reconnect to the <strong>same</strong> QuickBooks company and
          everything already sent stays linked. Reconnecting to a <strong>different</strong> company is not
          supported yet — the saved links point at the old company, so contact support before switching.
        </p>
      </Section>
    </DocsFontScope>
  );
}
