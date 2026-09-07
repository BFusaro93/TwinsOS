import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const NAV_TABS: [string, string, string][] = [
  ["Home", "/portal", "Balance-due summary, an in-progress-visit banner, upcoming visits (next 3), and open estimates (up to 3). Always shown."],
  ["Billing", "/portal/billing", "Every invoice, split into Outstanding and History, with Pay and PDF-download actions. Always shown."],
  ["Services", "/portal/services", "Upcoming and completed job visits, with a live in-progress banner. Always shown."],
  ["Estimates", "/portal/estimates", "Open and past estimates, with Accept / Decline / Request Changes on open ones. Hidden if the org turns off “Show Estimates.”"],
  ["Tickets", "/portal/tickets", "The client’s support tickets, plus a New Ticket form. Hidden if the org turns off “Allow Tickets.”"],
  ["Documents", "/portal/documents", "A shared document library (same files for every client of that org), grouped by category. Hidden if the org turns off “Document Library.”"],
  ["Account", "/portal/account", "Contact info, billing address, saved payment method, and additional contacts. Always shown."],
];

const SETTINGS_ROWS: [string, string][] = [
  ["Company Name", "Shown in the portal header, browser tab area, and outbound emails (invite email, etc.). Falls back to the org’s own name if blank."],
  ["Accent Color", "Used for the logo-placeholder tile and various accents when no logo is set."],
  ["Logo URL", "A public image URL. Recommended 200×60px PNG or SVG. Replaces the accent-color letter tile in the header when set."],
  ["Welcome Message", "Free text; stored but not yet rendered anywhere in the current portal pages."],
  ["Support Phone / Support Email", "Shown in the header (phone) and mobile menu / footer (phone and email) as tel: and mailto: links."],
  ["Show Estimates", "Toggles the Estimates nav tab."],
  ["Allow Tickets", "Toggles the Tickets nav tab and the ability to submit new tickets."],
  ["Document Library", "Toggles the Documents nav tab."],
  ["Visible Ticket Categories", "A checklist of the org’s CRM ticket categories (Settings → CRM). Only checked categories appear in the client-facing “New Ticket” category dropdown — keep internal-only categories like “Collections” unchecked."],
];

export default function ClientPortalGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Client Portal"
        title="The Client Portal"
        description="A branded, self-serve site where Landscapt clients view their account, pay invoices, and act on estimates — entirely separate from staff login."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">What it is</TOCLink>
          <TOCLink href="#access">Giving a client access</TOCLink>
          <TOCLink href="#signing-in">Signing in, and multi-company clients</TOCLink>
          <TOCLink href="#nav">What a client sees</TOCLink>
          <TOCLink href="#billing">Billing and online payment</TOCLink>
          <TOCLink href="#estimates">Reviewing and accepting estimates</TOCLink>
          <TOCLink href="#branding">Branding and portal settings</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="overview" title="What it is">
        <p>
          The client portal is a separate, public-facing Next.js route tree at <code>/portal</code>, distinct
          from the staff app. It is not a preview or an embed — it&apos;s its own login, its own layout shell,
          and its own set of pages, all scoped to a single <code>Client</code> record.
        </p>
        <p>
          A client can view their balance and pay invoices online, see upcoming and completed job visits,
          review and act on open estimates (accept with an e-signature, decline, or request changes),
          submit support tickets, browse a shared document library, and manage their own contact info and
          saved payment method. None of this requires a staff account — portal users authenticate as their
          own Supabase Auth user, tagged with <code>user_metadata.portal</code> so they can never be confused
          with a staff login.
        </p>
        <p>
          Every portal page is a server component that resolves the signed-in user to a <code>client_id</code>
          {" "}+ <code>org_id</code> pair via <code>getPortalContext()</code>, then queries that client&apos;s own
          data — the same tables Landscapt staff use (<code>crm_invoices</code>, <code>crm_job_visits</code>,
          {" "}<code>estimates</code>, tickets), just filtered down to one client.
        </p>
      </Section>

      <Section id="access" title="Giving a client access">
        <p>Clients don&apos;t self-register. Access is invite-only, and staff control it from the client record:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open the client in Landscapt CRM, open the <strong>…</strong> menu on the client header, and choose{" "}
            <strong>Send Portal Invite</strong>.
          </li>
          <li>
            Confirm (or edit) the email address. The dialog reads the client&apos;s current portal
            state: if an invite is already out, the button says <strong>Re-send invite</strong> and
            the dialog notes whether the earlier one has expired or simply hasn&apos;t been accepted
            yet; if the client already has an active portal login, it says so (with their last login)
            and offers <strong>Revoke access &amp; send new invite</strong> instead — a client can
            only have one active portal account at a time.
          </li>
          <li>
            An invite email goes out via Resend, branded with the org&apos;s name, containing a link to{" "}
            <code>/portal/register/[token]</code>. If email delivery fails, the invite link is still returned
            to staff so it can be shared manually.
          </li>
          <li>
            The invite expires after <strong>7 days</strong>. Sending a new invite for the same client
            automatically revokes any still-pending one.
          </li>
          <li>
            The client opens the link, sees the email pre-filled (read-only), sets a password (minimum 8
            characters, one uppercase, one lowercase, one number), and is signed in automatically.
          </li>
        </ol>
        <p>
          <strong>Checking where a client stands.</strong> The client&apos;s <strong>Details</strong>{" "}
          tab has a Client Portal block showing the current status: <strong>No access</strong> (never
          invited), <strong>Invited</strong> with the invite date and expiry — or{" "}
          <strong>Invite expired</strong> once the 7 days are up — or <strong>Active</strong> with the
          login email, registration date, and last login (&quot;Never signed in&quot; if they
          registered but haven&apos;t been back). A button beneath it reads Send portal invite, Re-send
          invite, or Manage portal access depending on that status, and opens the same dialog as the{" "}
          <strong>…</strong> menu. Start here when a client says they can&apos;t log in.
        </p>
        <p>
          Revoking access is the mirror action: the same <strong>…</strong> menu&apos;s portal dialog offers
          a reset that soft-deletes the <code>client_portal_users</code> row (recording <code>deleted_at</code>,
          per this project&apos;s no-hard-delete rule) and also deletes the underlying Supabase Auth user
          outright, so the email address becomes available for a fresh invite. Any still-pending invite for
          that client is revoked at the same time.
        </p>
      </Section>

      <Section id="signing-in" title="Signing in, and multi-company clients">
        <p>
          Portal sign-in lives at <code>/portal/login</code> — a completely separate page from staff login,
          with its own email/password form. On successful sign-in the app checks for{" "}
          <code>user.user_metadata.portal</code>; if it&apos;s missing (i.e. this is a staff account, not a
          portal account) the session is immediately signed back out with &quot;No portal account found for
          this email.&quot; First-time visitors can also paste their invite link or bare token directly into
          the login page instead of clicking through email.
        </p>
        <p>
          One real edge case the code explicitly handles: <strong>the same email address can be a client of
          two different Landscapt-using organizations.</strong> If someone accepts a second company&apos;s
          invite using an email that already has a portal account, registration links the new company&apos;s
          {" "}<code>client_portal_users</code> row to the existing auth user rather than creating a second
          login — the person then signs in once and picks which company to view.
        </p>
        <p>
          That selection happens at <code>/portal/select-org</code>: if a signed-in portal user has more than
          one active org and hasn&apos;t chosen one yet (tracked via a <code>portal_org_id</code> cookie), they
          land on a picker showing each company&apos;s name, logo/accent color, and the client name under that
          company, before being dropped into that org&apos;s portal. A &quot;Switch company&quot; link on the
          Account page lets them return to the picker later.
        </p>
      </Section>

      <Section id="nav" title="What a client sees">
        <p>
          The portal shell is a lightweight top nav (with a mobile hamburger menu) built around seven possible
          tabs. Three feature tabs can be turned off per org from Landscapt settings — see{" "}
          <a href="#branding" className="text-[#60ab45] hover:underline">Branding and portal settings</a> below.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Tab</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">What&apos;s there</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {NAV_TABS.map(([label, route, desc]) => (
              <tr key={label} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{label}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#4a4a46]">{route}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          The Home dashboard and the Services page both show an amber &quot;Service in Progress&quot; banner
          when a visit&apos;s status is <code>in_progress</code>, kept live by a Supabase Realtime
          subscription on <code>crm_job_visits</code> — the banner updates itself the moment staff mark a
          visit in progress or complete, with no page refresh needed.
        </p>
      </Section>

      <Section id="billing" title="Billing and online payment">
        <p>
          The Billing tab lists every invoice split into <strong>Outstanding</strong> and{" "}
          <strong>History</strong>, with a running balance-due total and a PDF download for each invoice. A
          client with exactly one outstanding invoice gets a one-click <strong>Pay Now</strong>; with more than
          one, they pay each invoice individually from its row.
        </p>
        <p>
          Payment runs through Stripe (via Stripe Elements/Payment Element), scoped to the org&apos;s connected
          Stripe account. Clients choose <strong>Card</strong> or <strong>Bank Transfer (ACH)</strong>; starting
          a payment creates a payment intent, and the confirmation screen shows the amount due, any processing
          fee, and the total charge before the client confirms. On success the invoice balance updates within
          a few seconds (the UI refreshes the page automatically). If the org has no Stripe publishable key
          configured, the dialog simply says online payments aren&apos;t available yet, in place of the payment
          form.
        </p>
        <p>
          A client can also save a payment method on their Account page for reuse, and remove it later; the
          Billing tab links there rather than duplicating that management UI.
        </p>
      </Section>

      <Section id="estimates" title="Reviewing and accepting estimates">
        <p>
          Only estimates the org has sent to that client (stage <code>sent</code>) show up, split into{" "}
          <strong>Pending Review</strong> and <strong>History</strong>. Three actions are available on an open,
          non-expired estimate:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Review &amp; Accept</strong> — opens a dialog rendering the estimate&apos;s line items
            (respecting the same section grouping and display settings — quantities, line totals, section
            subtotals — staff configured on the estimate itself). If the estimate has line items, each one
            has its own checkbox, pre-checked, so a client can accept only part of an estimate; the dialog
            recalculates the selected total live. Typing a full name into the signature field and confirming
            posts the acceptance (and which line items were accepted, if partial) to the estimate. Lines the
            client left unchecked are marked lost on the estimate and are excluded from the Accepted
            Estimates by Service reports.
          </li>
          <li>
            <strong>Decline</strong> — a confirmation dialog that notifies the org&apos;s team; no reason
            is required from the client. On the staff side the estimate moves to the{" "}
            <strong>Lost</strong> stage with the reason &quot;Declined by client via portal&quot; —
            the same outcome the office would record by hand, so it counts against Close Ratios and
            drops out of the open pipeline immediately.
          </li>
          <li>
            <strong>Request Changes</strong> — a free-text message sent back to the org without accepting
            or declining; the estimate stays open and the button is replaced with a &quot;Request sent&quot;
            confirmation.
          </li>
        </ul>
        <Callout>
          An estimate past its <code>expires_at</code> date is shown as <strong>Expired</strong> and its action
          buttons disappear, even if its underlying status is still <code>sent</code> or <code>viewed</code>.
        </Callout>
      </Section>

      <Section id="branding" title="Branding and portal settings">
        <p>
          Staff configure the portal from <strong>Landscapt Settings → Client Portal</strong>. Every
          Landscapt Settings tab can be linked to directly with <code>?tab=</code> — for example{" "}
          <code>/crm/settings?tab=client-portal</code> opens this tab, and switching tabs updates the
          address bar so the link you copy reopens the tab you were on. Settings are per-org — there is one{" "}
          <code>client_portal_settings</code> row per org, and everything a client sees is white-labeled to
          that org&apos;s own name, color, and logo rather than showing &quot;Equipt&quot; or
          &quot;Landscapt&quot; branding anywhere in the shell.
        </p>
        <Table>
          <tbody>
            {SETTINGS_ROWS.map(([label, desc]) => (
              <tr key={label} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{label}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          The same settings page also hosts the <strong>Document Library</strong> manager: staff upload files
          (title, category, optional description) that appear identically to every client of that org —
          it&apos;s one shared library, not per-client. Clients download files via a short-lived (5-minute)
          signed Supabase Storage URL generated on demand, so nothing client-facing ever holds a permanent
          public link to the file.
        </p>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>No portal access configured.</strong> A client with no <code>client_portal_users</code> row
            simply has no way in — there&apos;s no self-signup. If a client says they can&apos;t log in,
            check the portal status on their Details tab (No access / Invited / Invite expired /
            Active) before assuming a bug.
          </li>
          <li>
            <strong>One portal account per client, but one login can span multiple clients/orgs.</strong> Don&apos;t
            confuse the two directions: a given <code>Client</code> record can only have one active portal
            account, but a given email address/person can be linked to several different orgs&apos; client
            records and switch between them at <code>/portal/select-org</code>.
          </li>
          <li>
            <strong>Feature toggles hide the tab, not the route.</strong> Turning off &quot;Allow Tickets&quot;
            etc. removes the nav item; verify server-side authorization separately if you&apos;re extending
            these pages, rather than assuming a hidden tab means the underlying data is inaccessible.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
