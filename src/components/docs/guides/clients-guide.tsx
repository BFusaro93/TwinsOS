import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const STATUS_ROWS: [string, string, string][] = [
  [
    "Lead",
    "Default status for a client added as a prospect, or set manually.",
    "Estimates can be built and sent. Jobs, invoices, and contracts are blocked until the status moves to Active — a Lead isn't a customer yet. Leads don't appear in the Add Job client picker, and a job created for one any other way (API, Zapier, import) is rejected with a “convert the lead first” error.",
  ],
  [
    "Active",
    "Set manually, or automatically the moment a Lead is converted (see below).",
    "Full access: jobs, invoicing, contracts, the estimating engine, all of it.",
  ],
  [
    "Inactive",
    "Set manually — a client who's paused service without formally cancelling (seasonal pause, temporary hold).",
    "Existing jobs and invoices stay visible and editable, but the client won't appear as a pick target for new recurring job generation.",
  ],
  [
    "Cancelled",
    "Set manually, and only after a cancellation reason is picked.",
    "Read-only for scheduling and invoicing going forward. History stays intact for churn reporting.",
  ],
  [
    "Lost",
    "A Lead closed without converting — via Close as Lost on the Leads list, or when the client declines an estimate in the portal.",
    "Still a lead, not a client: it never appears in client counts or Client Since reporting, and shows up in the Closed Leads Summary instead. Like an open Lead, it can't have jobs.",
  ],
];

const CONTACT_TYPES = [
  "Owner",
  "Primary",
  "Spouse",
  "Property Manager",
  "District Manager",
  "Trustee/Board Member",
  "Employee",
  "Child",
  "Other",
];

const TIMELINE_FILTERS: [string, string][] = [
  ["All History", "Everything below, in one chronological feed."],
  ["Notes", "Notes, calls, emails, and tickets."],
  ["Visits", "Job created, scheduled job visits, visit moves, dispatches, skips and cancellations (with the reason), and completed job records."],
  ["Transactions", "Invoices and payments."],
  ["Estimates", "Estimates and contracts."],
];

export function ClientsGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Clients, Properties & Leads"
        description="Client accounts, commercial hierarchies, service properties, and the activity timeline that ties it all together."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#creating-a-client">Creating a client</TOCLink>
          <TOCLink href="#status">Client status &amp; the Lead-to-Client transition</TOCLink>
          <TOCLink href="#client-since">Client Since, and how leads are counted</TOCLink>
          <TOCLink href="#hierarchy">Commercial parent/child hierarchy</TOCLink>
          <TOCLink href="#properties">Properties</TOCLink>
          <TOCLink href="#custom-fields">Custom Fields &amp; zone measurements</TOCLink>
          <TOCLink href="#aerial-measurement">Aerial Measurement</TOCLink>
          <TOCLink href="#contacts">Contacts</TOCLink>
          <TOCLink href="#timeline">Activity timeline</TOCLink>
          <TOCLink href="#account-statement">Account Statement</TOCLink>
        </div>
      </div>

      <Section id="creating-a-client" title="Creating a client">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to <strong>CRM &gt; Clients</strong> and click <strong>+ New Client</strong>.
          </li>
          <li>
            The quick-create step captures just four things: <strong>Display Name</strong>,{" "}
            <strong>Account Type</strong> (Residential or Commercial — Residential is the default),
            plus phone and email. Whether phone and email are required depends on your org&apos;s
            field settings.
          </li>
          <li>
            Click <strong>Create &amp; Continue →</strong> and the full client record opens
            immediately — billing info, custom fields, contacts, and office notes all live there.
          </li>
        </ol>
        <p>
          A client also gets a <strong>Source</strong> field (referral, Google, BNI, etc. — your
          org configures the option list) and an optional <strong>Referred By</strong> link back to
          another client record, plus free-form <strong>tags</strong> for segmentation. None of
          these are required at creation — they&apos;re filled in on the full record afterward.
        </p>
      </Section>

      <Section id="status" title="Client status & the Lead-to-Client transition">
        <p>
          Every client has exactly one status. There is no separate &quot;lead&quot; object or
          conversion record anywhere in the schema — <strong>a Lead is a client whose status field
          happens to say &quot;Lead.&quot;</strong> Converting a lead to a client is nothing more
          than changing that one field to Active (which also stamps the record&apos;s{" "}
          <strong>Client Since</strong> date — see below). Click{" "}
          <strong>Convert to Client</strong> on the lead&apos;s record, confirm in the dialog that
          appears, and the status flips; a <strong>&quot;Converted from lead to client&quot;</strong>{" "}
          entry is logged on the Activity timeline so you can see later exactly when it happened.
          Everything else — the display name, contacts, properties, custom fields, activity history
          already on the record — carries straight through untouched. This is also why the Zapier &quot;Lead Converted to
          Client&quot; trigger (see the Zapier guide) is really just watching for a status change
          to &quot;active,&quot; not a distinct event type.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">How it&apos;s set</th>
              <th className="px-3 py-2">What&apos;s allowed / blocked</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATUS_ROWS.map(([name, trigger, allowed]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{trigger}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{allowed}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Cancelling a client requires picking a reason — <strong>Price</strong>,{" "}
          <strong>Moved</strong>, <strong>Unhappy with Service</strong>,{" "}
          <strong>No Longer Needs Service</strong>, or <strong>Other</strong> (which reveals a
          free-text field) — and that reason is kept on the record permanently for churn reporting.
          There&apos;s no undo dialog for it: to bring a cancelled client back, change the status
          again like any other field.
        </p>
        <Callout>
          Because a lead and a client are the same row, nothing about a lead&apos;s
          history — estimates, notes, an already-scheduled site visit — gets lost or re-created
          when it converts. If you built an estimate while a client was still a Lead, that estimate
          is still there, on the same record, once the status flips to Active.
        </Callout>
      </Section>

      <Section id="client-since" title="Client Since, and how leads are counted">
        <p>
          <strong>Client Since</strong> is the date a lead became a client — not the date the
          record was created. It is set automatically the moment a lead converts: clicking{" "}
          <strong>Convert to Client</strong> and confirming, or changing a Lead&apos;s status to
          Active in Edit. A record
          created directly as an Active client gets its creation date. Leads — open or Lost —
          have no Client Since at all, which is what lets reports tell &quot;when did we first
          hear from them&quot; (created date) apart from &quot;when did they start paying
          us&quot; (Client Since).
        </p>
        <p>The lead and client reports lean on exactly that split:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>New Leads</strong> figures (Company Scorecard, Clients/Leads Monthly Matrix,
            the dashboard gauges) count every account <em>created</em> in the window, whatever its
            status is today — a lead that converted the same week still counts as a new lead that
            week.
          </li>
          <li>
            <strong>New Clients / Converted</strong> figures use Client Since, so a lead created in
            March and converted in May is a May client.
          </li>
          <li>
            <strong>Closed Leads</strong> means leads with status <strong>Lost</strong>. A lost lead
            is never counted as a client anywhere — client totals are Active + Inactive +
            Cancelled only.
          </li>
        </ul>
        <Callout>
          The Clients list can filter and sort by <strong>Client Since Date</strong>; the Leads
          list shows a &quot;Date added&quot; column instead — the day the lead was created — since
          a lead has nothing to put in Client Since yet.
        </Callout>
      </Section>

      <Section id="hierarchy" title="Commercial parent/child hierarchy">
        <p>
          Commercial clients can be nested under a property-manager parent using{" "}
          <strong>Link Parent Account</strong> on the child&apos;s detail page. The hierarchy is
          strictly <strong>one level deep</strong>: only a client that doesn&apos;t already have a
          parent of its own can be picked as a parent. A client that&apos;s already a child is
          filtered out of the parent picker entirely — you&apos;d need to unlink it from its current
          parent first before it could become a parent itself.
        </p>
        <p>
          The parent&apos;s detail page shows a <strong>Sub-Accounts</strong> banner listing every
          child and a combined balance figure. That balance is the parent&apos;s own outstanding
          balance <em>plus</em> the sum of every child&apos;s outstanding balance — not just the
          children&apos;s total — so the number on the banner always reflects everything owed across
          the whole account family, including the parent record itself if it carries its own charges.
        </p>
        <p>
          &quot;Outstanding balance&quot; here means the client&apos;s <strong>Account
          Balance</strong>: the unpaid portion of <em>issued</em> invoices only. Draft invoices —
          auto-generated from completed visits but not yet printed or sent — are deliberately left
          out and shown as a separate <strong>Uninvoiced</strong> line on the client header, which
          links to those drafts. The same rule applies to every balance, receivables, and revenue
          figure in the Report Center; drafts appear only on the Income Not Invoiced report.
        </p>
        <p>
          <strong>Worked example.</strong> A property management company, &quot;Ridgeline
          Property Management,&quot; oversees three separate HOA communities you service on
          different contracts: Ridgeline manages Oakview HOA, Brookstone HOA, and Cedar Hills HOA as
          three individual commercial client records. You create Ridgeline Property Management as a
          commercial client, then create Oakview, Brookstone, and Cedar Hills as commercial clients
          in their own right (each keeps its own properties, contacts, jobs, and invoices — an HOA
          board still needs its own invoice history and site details). On each of the three HOA
          records, click <strong>Link Parent Account</strong> and pick Ridgeline. Now Ridgeline&apos;s
          record shows a Sub-Accounts banner with all three HOAs listed and a single combined balance
          — say Oakview owes $1,200, Brookstone owes $800, and Cedar Hills owes $0, with Ridgeline
          itself carrying no direct charges: the banner reads $2,000. If Ridgeline&apos;s
          management contract also bills a management fee directly to Ridgeline itself, that amount
          is added on top, not folded into or replacing the children&apos;s totals.
        </p>
        <Callout>
          None of the three HOAs can, in turn, be used as a parent for a fourth client — they each
          already have a parent (Ridgeline), so the hierarchy stops at one level. If Cedar Hills
          later gets acquired by a different management company, you&apos;d unlink it from Ridgeline
          before it could be linked under the new parent.
        </Callout>
        <p>
          <strong>Paying a sub-account&apos;s invoice from the parent.</strong> When Ridgeline mails
          one check covering all three HOAs, record the payment on <strong>Ridgeline</strong> and
          allocate it across the HOAs&apos; invoices in that single entry. Each HOA&apos;s own record
          then shows the payment on its <strong>Accounting</strong> card, tagged{" "}
          <strong>&quot;via Ridgeline Property Management&quot;</strong>, so someone looking at Oakview
          alone can see how its invoice got paid without knowing to check the parent. Those rows are
          read-only on the sub-account — edit or reverse the payment from the parent where it was
          recorded.
        </p>
      </Section>

      <Section id="properties" title="Properties">
        <p>
          On a client&apos;s detail page, click <strong>Add Property</strong> under Related
          Properties. The dialog captures a property name/label (e.g. &quot;Main Office,&quot;
          &quot;Rental Unit&quot;), street address, city, state, ZIP, a gate code, and notes to
          crew. A single client can have any number of properties — this is how one commercial
          client, or a residential client with a rental, ends up with several distinct service
          addresses under one account.
        </p>
        <Callout>
          The Add Property dialog does not capture zone measurements (turf sq ft, mulch beds, etc.)
          &mdash; use <strong>More → Aerial Measurement</strong> or the client&apos;s Custom Fields
          tab. See the next two sections.
        </Callout>
      </Section>

      <Section id="custom-fields" title="Custom Fields & zone measurements">
        <p>
          Measurements that feed the estimating engine&apos;s production-rate calculations are kept
          as <strong>takeoffs</strong> on the client: <strong>Turf Sq. Ft.</strong>,{" "}
          <strong>Mulch Bed Sq. Ft.</strong>, <strong>Parking Lot / Hardscape Sq. Ft.</strong>,{" "}
          <strong>Gross Sq. Ft.</strong>, <strong>Linear Ft. Perimeter</strong>,{" "}
          <strong>Linear Ft. Edging</strong>, and <strong>Yards of Mulch</strong>. You can type them
          in by hand on the Edit Client dialog&apos;s <strong>Custom Fields</strong> tab (Takeoffs
          section), or let the Aerial Measurement tool calculate them from a satellite map. The
          Details tab shows the current values. The gate code also has a home here, under an
          Access section, in addition to the one captured per property.
        </p>
        <p>
          Typed takeoffs are one combined number per client. Aerial Measurement is the only place
          that breaks measurements down zone by zone and property by property.
        </p>
      </Section>

      <Section id="aerial-measurement" title="Aerial Measurement">
        <p>
          Open a client and choose <strong>More → Aerial Measurement</strong> to trace the property
          on a satellite map and have the square footage and distances calculated for you. It needs
          the Google Maps key in <strong>Settings → Integrations</strong>; without one the dialog
          tells you it isn&apos;t configured. If the client has no property yet, one is created
          automatically from the client&apos;s service address (or billing address); a client with
          no address on file needs one added under Details first. When the client has more than one
          property, pick which one to measure from the dropdown at the top. A pin marks the
          property&apos;s address.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Trace Area</strong> &mdash; click each corner of a lawn, bed or paved area, then{" "}
            <strong>Finish Shape</strong>. <strong>Undo Point</strong> removes the last corner and{" "}
            <strong>Cancel</strong> abandons the shape. Corners show as dots, and a running readout
            follows the cursor while you trace.
          </li>
          <li>
            <strong>Subtract Area</strong> &mdash; trace a region to cut out of the totals, such as
            the house inside a whole-lot turf trace. Subtracted shapes draw in red and count as
            negative square footage. A total never goes below zero.
          </li>
          <li>
            <strong>Measure Distance</strong> &mdash; click along a fence line, edge or run, then{" "}
            <strong>Finish Line</strong>. The length shows in feet, yards and meters.
          </li>
        </ol>
        <p>
          Every shape lands in a table below the map. For each area, set its <strong>name</strong>,{" "}
          <strong>Type</strong> (Turf, Mulch Bed, Parking Lot / Hardscape, or Other) and{" "}
          <strong>Effect</strong> (Adds or Subtracts); you can also drag the corners on the map to
          adjust. For each distance, set its name and <strong>Type</strong> (Perimeter, Edging or
          Other). Areas of the same type add together, and the table shows a total per type plus an
          overall total. A shape that crosses itself is flagged and has to be retraced before you
          can save.
        </p>
        <p>
          <strong>Sync to Custom Fields.</strong> If your organization has number-type custom
          fields (set up under CRM Settings → Custom Fields), the dialog lists each one with a
          dropdown of what to keep it in sync with: Turf total, Mulch bed total, Parking lot total,
          Gross total, or a Perimeter / Edging / Other / All-distances total (the dropdown guesses a
          sensible match from the field name). A distance can instead be pointed at a specific
          field with its <strong>Counts toward</strong> column; several distances pointed at the
          same field add together, and that field shows &ldquo;From distance lines&rdquo; instead of
          a dropdown. A field is only written when something of that type was actually measured, so
          saving never overwrites an existing value with 0.
        </p>
        <p>
          <strong>Saving.</strong> Click Save to store the shapes on the property. When the property
          is the client&apos;s own (master) address, its Turf, Mulch Bed, Parking Lot / Hardscape and
          Gross totals, plus the Perimeter and Edging distance totals, are also copied onto the
          client&apos;s takeoff fields so the Details tab and estimates see them straight away. Each
          takeoff is only changed when that type is in the saved shapes (or was there before and has
          been deleted, which clears it); distances typed <em>Other</em> only feed custom fields. Extra properties you added yourself keep their
          measurements at the property level only. A Trace or Measure still in progress has to be
          finished or cancelled before saving.
        </p>
      </Section>

      <Section id="contacts" title="Contacts">
        <p>
          Add contacts from the client detail page, each with a type:{" "}
          {CONTACT_TYPES.map((t, i) => (
            <span key={t}>
              <strong>{t}</strong>
              {i < CONTACT_TYPES.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
        <p>
          A contact can have multiple phone numbers on file. Toggle the star (★) next to a number
          to mark it primary — the same star toggle exists on the client&apos;s own phone numbers,
          independent of any contact.
        </p>
      </Section>

      <Section id="timeline" title="Activity timeline">
        <p>
          Every note, call, email, invoice, payment, job visit, estimate, contract, automation, and
          ticket tied to a client lands in one chronological <strong>Activity Timeline</strong> on
          that client&apos;s record. Scheduling actions land here too: creating a job (including one
          converted from an estimate) logs &quot;Job created,&quot; moving a visit to another day
          logs &quot;Visit moved 9/7 → 9/8,&quot; dispatching one logs &quot;Visit
          dispatched,&quot; and skipping or cancelling one logs the reason the dispatcher picked
          (&quot;Visit skipped 9/9 — Client requested delay&quot;). In practice this is the fastest way to answer &quot;what&apos;s
          actually happened with this client&quot; without hopping between the invoices tab, the
          estimates tab, and a separate notes log — everything is one feed, newest first, and each
          row deep-links straight to the invoice, estimate, or job it references.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Filter</th>
              <th className="px-3 py-2">Shows</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {TIMELINE_FILTERS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          Before chasing down a client dispute or a &quot;did we ever quote this&quot; question in
          separate tabs, start on the Activity Timeline — it&apos;s the single source of truth for
          the account, and filtering to Transactions or Estimates narrows it down in one click
          instead of cross-referencing multiple pages.
        </Callout>
      </Section>

      <Section id="account-statement" title="Account Statement">
        <p>
          <strong>Client &gt; More &gt; Account Statement</strong> generates a mail-in-style,
          running-balance statement PDF for the client — modeled on the org&apos;s old Service
          Autopilot statement report. The dialog sets a <strong>Statement Date</strong>, a{" "}
          <strong>Period From/To</strong> range, a toggle for whether to show invoice/payment
          line-item detail or just the running totals, a &quot;don&apos;t generate if balance is
          less than&quot; minimum-balance filter, and an optional statement message — with a live
          preview of the PDF alongside the fields as they&apos;re changed.
        </p>
        <p>
          <strong>Open / Print</strong> opens the generated PDF in a new tab; <strong>Email
          Statement</strong> sends it to an address (defaulting to the client&apos;s own, but
          editable) instead. If the minimum-balance filter is set and the client&apos;s balance
          falls short of it, an email send is silently skipped rather than sent — the dialog
          reports this so it isn&apos;t mistaken for a delivery failure.
        </p>
      </Section>
    </DocsFontScope>
  );
}
