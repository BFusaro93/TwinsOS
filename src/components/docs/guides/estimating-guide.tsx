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

const STAGES: [string, string][] = [
  ["Draft", "Default stage for a brand-new estimate. Still being built — line items and pricing are in flux. Drafts were never presented to a client, so Close Ratios and win-rate figures leave them out of both counts and amounts."],
  ["Quote", "Set manually once the estimate is ready for internal review — the numbers are considered final pending sign-off."],
  ["Sent", "Set when the estimate is actually delivered to the client (email, PDF, or the client portal). Blocked from actually going out if Approval Status is still Pending — see the callout below. The bulk Mark as Sent action on the estimates list skips any selected estimate whose approval is pending or denied, and says how many it skipped; open those and send from the estimate. A bulk stage change that is blocked for some estimates (for example one with active jobs or invoices) still applies to the rest and reports how many couldn’t be moved. Pipeline dashboards count Sent estimates as open pipeline alongside Draft and Quote."],
  ["Accepted", "Set when the client accepts — in full or via a tiered/partial acceptance, whether you mark it in-app or the client accepts online through the proposal link. Once an estimate is Accepted, a Convert to Job button appears in its header; converting normally happens from here."],
  ["Lost", "Set when the client declines — including a Decline in the client portal, which records the reason “Declined by client via portal” — or when an estimate is manually marked dead. Line items already marked “lost” individually (e.g. a tier the client unchecked when accepting) don’t count toward totals, and the Accepted Estimates by Service reports skip them. Lines still marked “draft” (not yet part of the quote — the proposal hides them too) are left out of totals, the PDF and the client portal the same way."],
  ["Invoiced", "Set once billing has started against the estimate (a deposit, milestone, or the full amount has been invoiced)."],
];

const COST_TYPES: [string, string, string][] = [
  ["Labor", "Labor Overhead + Labor Burden", "Line items’ modeled cost (totalCostCents) is bucketed here, alongside any Direct Cost rows typed as Labor."],
  ["Sub-Contract", "Contract Overhead", "Subcontracted work entered as a Direct Cost."],
  ["Product/Material", "Materials Overhead", "Materials entered as a Direct Cost."],
  ["Asset/Equipment", "Equipment Overhead", "Equipment costs entered as a Direct Cost."],
  ["Service/Other", "Other Overhead", "Direct Costs typed as Service or Other — there’s no dedicated bucket for “Service,” so it shares Other’s rate."],
];

export function EstimatingGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Estimates & the Budget Engine"
        description="How an estimate is built, how its numbers are actually calculated, and how it becomes a job."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#creating">Creating an estimate</TOCLink>
          <TOCLink href="#estimate-builder">Estimate Builder: drafting line-item text from a transcript</TOCLink>
          <TOCLink href="#stage-vs-approval">Stage vs. approval status</TOCLink>
          <TOCLink href="#budget-methods">Manual vs. production-rate budgeting</TOCLink>
          <TOCLink href="#worked-example">A worked example, start to finish</TOCLink>
          <TOCLink href="#why-snapshot">Why budget method is snapshotted per-line</TOCLink>
          <TOCLink href="#complexity-and-rate-matrix">Complexity multiplier &amp; Rate Matrix pricing</TOCLink>
          <TOCLink href="#reading-the-grid">Reading the line-item grid</TOCLink>
          <TOCLink href="#bundles-subitems">Service bundles and sub-items</TOCLink>
          <TOCLink href="#line-subitems">Sub-items, equipment and pricing warnings on a line</TOCLink>
          <TOCLink href="#packages-on-estimates">Packages on an estimate</TOCLink>
          <TOCLink href="#zone-measurements">Where zone measurements come from</TOCLink>
          <TOCLink href="#proposal-link">The client-facing proposal link</TOCLink>
          <TOCLink href="#estimate-defaults">What a new estimate starts with</TOCLink>
          <TOCLink href="#deposits">Taking a deposit on acceptance</TOCLink>
          <TOCLink href="#estimate-limits">Rate and probability limits</TOCLink>
          <TOCLink href="#converting">Converting an estimate to a job</TOCLink>
          <TOCLink href="#good-to-know">Good to know</TOCLink>
        </div>
      </div>

      <Section id="creating" title="Creating an estimate">
        <p>
          On the Estimates list, the <strong>Client</strong>, <strong>Stage</strong> and{" "}
          <strong>Sales Rep</strong> column filters are picked from a list and match exactly
          (Sales Rep also offers <em>Unassigned</em>).
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to <strong>CRM &rarr; Estimates &rarr; + New Estimate</strong>.
          </li>
          <li>
            Pick a client. Leads are labeled <strong>&ldquo;(lead)&rdquo;</strong> in the picker so
            you can tell them apart from active clients at a glance; inactive or cancelled clients
            don&rsquo;t show up at all.
          </li>
          <li>
            Set the <strong>estimate date</strong> and a <strong>valid-until date</strong> &mdash;
            it defaults to 30 days out, but can be pushed further for a bid that needs more runway.
            The proposal page is honored through the end of that day (in your company&rsquo;s
            time zone); see &ldquo;Valid until&rdquo; under the proposal link below.
          </li>
          <li>
            Assign a <strong>sales rep</strong> and, if needed, a <strong>Sale Type</strong> (new sale or
            renewal) &mdash; it decides which commission rate applies and flows through to the job and
            invoice.
          </li>
        </ol>
        <p>
          From there you&rsquo;re in the estimate detail view, where line items, direct costs, and
          the summary panel all live.
        </p>
      </Section>

      <Section id="estimate-builder" title="Estimate Builder: drafting line-item text from a transcript">
        <p>
          <strong>Tools → Estimate Builder</strong> is a small AI-assisted writing aid, separate from
          the estimate detail view itself. It takes a sales-visit transcript and turns it into
          draft line-item wording you copy into a real estimate &mdash; it does not create or touch
          any estimate record on its own.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Upload a transcript file (<strong>.txt</strong> or <strong>.vtt</strong>) or paste
            transcript text directly. For a <strong>.vtt</strong> file, the tool automatically
            strips the <code>WEBVTT</code> header, speaker-id lines, and timestamp lines before
            showing you the cleaned text.
          </li>
          <li>
            Click <strong>Generate Proposal</strong>. The transcript is sent to an AI model that
            drafts professional, client-ready line-item descriptions &mdash; grouped by service
            type, with locations, quantities, and exclusions called out, and any ambiguous point
            (like whether weed killer was discussed) flagged inline for you to resolve.
          </li>
          <li>
            Click <strong>Copy to Clipboard</strong> and paste the wording into the appropriate
            line item on the actual estimate you&rsquo;re building.
          </li>
        </ol>
        <Callout>
          <strong>This is a text draft, not a finished estimate.</strong> The tool never sets
          pricing, never submits anything, and never creates or modifies an{" "}
          <code>Estimate</code> record &mdash; it only produces description text sitting in the
          browser tab until you manually copy it in. Always check scope, quantities, and pricing
          against what was actually measured/quoted before pasting it in, and resolve any
          clarification flags in the output first.
        </Callout>
      </Section>

      <Section id="stage-vs-approval" title="Stage vs. approval status">
        <p>
          These are two separate fields on the estimate, and they get confused constantly because
          they both sound like &ldquo;where is this at.&rdquo; <strong>Stage</strong> tracks the
          sales process. <strong>Approval Status</strong> is a separate internal sign-off gate that
          sits on top of it.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">What sets it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STAGES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Approval Status runs on its own track: <strong>Not Required</strong>,{" "}
          <strong>Pending</strong>, <strong>Approved</strong>, or <strong>Rejected</strong>. It
          exists to hold an estimate back regardless of what stage says. An approval covers the total
          that was approved: if lines added afterwards push the total above it, Send and Copy link ask for
          approval again (clicking Send resubmits it), and the estimate can&apos;t go out until it is
          re-approved. On a <strong>Good / Better / Best</strong> estimate the approval covers the{" "}
          <em>highest</em> option (with its discount and tax), not the &ldquo;starting at&rdquo; total,
          because the client can accept any of them; once the client picks a tier, it&rsquo;s that
          tier&rsquo;s total.
        </p>
        <Callout>
          <strong>The trap.</strong> An estimate can show stage &ldquo;Sent&rdquo; while its
          approval status is still &ldquo;Pending.&rdquo; Stage reflects where the estimate is in
          the sales workflow, not whether it&rsquo;s cleared to actually go out &mdash; a pending
          approval blocks delivery even though the stage field already reads Sent. If a client says
          they never got an estimate you thought went out, check Approval Status first.
        </Callout>
      </Section>

      <Section id="budget-methods" title="Manual vs. production-rate budgeting">
        <p>
          Every service has a configured <strong>Budget Method</strong> (in service settings), and
          every estimate line item snapshots that method the moment the line is added:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Manual</strong> &mdash; budgeted hours are entered directly on the line, no
            formula involved.
          </li>
          <li>
            <strong>Production Rate</strong> &mdash; budgeted hours are derived:{" "}
            <code>hours = quantity &divide; the service&rsquo;s sq ft per man-hour</code>. A service
            added in Settings or imported from a CSV with a production rate is set to this method
            automatically; change it per service in the service&rsquo;s own dialog.
          </li>
        </ul>
        <p>
          One override applies regardless of method: if the line&rsquo;s unit type is{" "}
          <strong>hr</strong> (hourly), the entered quantity <em>is</em> the hours &mdash; there&rsquo;s
          nothing to derive.
        </p>
        <Callout>
          If this split feels familiar, it&rsquo;s deliberate. <strong>Manual</strong> is the
          Service Autopilot approach &mdash; a human estimates the hours a job will take.{" "}
          <strong>Production Rate</strong> is the Aspire approach &mdash; hours fall out of a
          measured area and a standardized rate for that service. The CRM supports both side by
          side, per service, so a shop migrating from either tool can keep working the way it
          already knows.
        </Callout>
      </Section>

      <Section id="worked-example" title="A worked example, start to finish">
        <p>
          Say a &ldquo;Mulch Installation&rdquo; service is configured with Budget Method =
          Production Rate and a production rate of <strong>1,000 sq ft per man-hour</strong>. A
          property&rsquo;s Mulch Bed Sq Ft measurement is <strong>8,000</strong>.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Budgeted hours:</strong> 8,000 sq ft &divide; 1,000 sq ft/man-hour ={" "}
            <strong>8 budgeted hours</strong> for one visit. With a single visit, total budgeted
            hours is also 8.
          </li>
          <li>
            <strong>Cost:</strong> the org&rsquo;s breakeven (fully-burdened) labor rate is, say,{" "}
            <strong>$45.00/hr</strong>. Because the line&rsquo;s Cost field is still at its
            never-set default of $0, it auto-fills the first time the line is added:{" "}
            8 hrs &times; $45.00 = <strong>$360.00 total cost</strong>.
          </li>
          <li>
            <strong>Rate (price to the client):</strong> say the line is priced at $0.12/sq ft,
            quantity-based (calc type &times;): 8,000 sq ft &times; $0.12 ={" "}
            <strong>$960.00 total</strong>.
          </li>
          <li>
            <strong>Margin:</strong> ($960.00 &minus; $360.00) &divide; $960.00 ={" "}
            <strong>37.5% gross margin</strong> &mdash; comfortably in the green band (30%+) on the
            line-item grid.
          </li>
          <li>
            <strong>Overhead:</strong> at the estimate level, that $360.00 in modeled line-item
            cost is bucketed as Labor cost and run through the org&rsquo;s configured Labor
            overhead + Labor Burden percentages (set separately from the per-line breakeven rate)
            to arrive at the estimate&rsquo;s overhead cost, which nets against gross profit to
            produce the estimate&rsquo;s net profit figure in the summary panel.
          </li>
        </ol>
        <p>
          Edit the Cost field directly at any point and that override sticks &mdash; the
          breakeven-rate auto-fill only ever applies while Cost is still exactly $0.
        </p>
        <p>
          The <strong>B.Hrs</strong> cell has its own calculator popover for building that number
          up instead of guessing: enter Men and Hrs:Min to compose budgeted hours (e.g. 2 men for
          2:30 = 5.0 hrs), or give it a target man-hour rate &mdash; defaulting to the org&rsquo;s
          breakeven labor rate &mdash; and it solves for whichever of Cost or B.Hrs you leave it to
          fill in.
        </p>
      </Section>

      <Section id="why-snapshot" title="Why budget method is snapshotted per-line">
        <p>
          It would be simpler for a line item to just read its service&rsquo;s current Budget
          Method live, every time. The engine deliberately doesn&rsquo;t do that: the method (and,
          for production-rate lines, the rate itself) is copied onto the line item at the moment
          it&rsquo;s added, and stays there.
        </p>
        <p>
          The reason is historical integrity. Say &ldquo;Mulch Installation&rdquo; is switched from
          Production Rate to Manual six months from now, or its production rate is retuned from
          1,000 to 1,200 sq ft/man-hour after a crew turns out to be faster than assumed. Every
          estimate written before that change already has real budgeted-hours numbers baked into
          it &mdash; numbers a job may have been scheduled and costed against, or a client may have
          already accepted a price built on. If line items re-read the service live, changing one
          service setting would silently rewrite the economics of every past estimate that used it,
          with no record that anything changed. Snapshotting means an old estimate keeps meaning
          exactly what it meant when it was sent, and a service&rsquo;s settings can be tuned going
          forward without touching history.
        </p>
      </Section>

      <Section id="complexity-and-rate-matrix" title="Complexity multiplier & Rate Matrix pricing">
        <p>
          Two more inputs can override the plain manual/production-rate math above. Both are
          snapshotted onto the line item the moment it&rsquo;s added or adjusted &mdash; same
          historical-integrity reasoning as budget method, above.
        </p>
        <p>
          <strong>Complexity multiplier.</strong> Every line item has a{" "}
          <strong>Complexity</strong> popover (the icon next to the line&rsquo;s notes button) set
          from <strong>50% to 200%</strong>, defaulting to 100% (no adjustment). It scales the
          line&rsquo;s <strong>Rate and Cost together</strong>, which is why it doesn&rsquo;t move
          GM% &mdash; a harder job costs and prices proportionally more without silently changing
          margin. It also scales the <em>effective</em> hours used for cost, dashboards, and the
          total-hours column. Critically, the hours you see and edit on the line
          (&ldquo;B.Hrs&rdquo;) always stay the plain, unscaled number you typed or that production
          rate derived &mdash; complexity is applied fresh every time something re-reads the line,
          never baked back into the stored hours. That matters in practice: dial complexity up to
          150%, then back down to 100%, and the line returns exactly to where it started instead of
          drifting.
        </p>
        <p>
          <strong>Rate Matrix.</strong> A service can have banded pricing rows configured against
          one of a property&rsquo;s custom fields (e.g. price breaks by Turf Sq Ft ranges). If the
          estimate has a value for the field a service&rsquo;s matrix is keyed on, adding that
          service looks up the matching band and uses <em>its</em> rate, budgeted hours, and cost
          instead of the service&rsquo;s flat production rate. The value is read from the
          <strong> property</strong> first (a built-in measurement such as Turf Sq Ft, or a custom
          field), then from the <strong>client</strong>, so an estimate with no property still prices
          from a client-level value. A line priced from a band is recorded as Manual budget method
          going forward, since its hours came from the matrix rather than a formula (a per-unit band
          on an area line is the exception and stays on the production rate). No value anywhere, or no
          matrix rows configured on the service, and the line falls through to the ordinary
          manual/production-rate behavior with nothing different. Like
          everything else here, the match is looked up once at add-time, not re-resolved later if
          the property&rsquo;s field value or the matrix rows change.
        </p>
        <p>
          Past the last band, the service&rsquo;s <strong>overflow rule</strong> (&ldquo;every Y over X
          adds $R&rdquo;, set on the Rate Matrix tab) steps the price up from the last band instead of
          falling back to the flat rate. See <em>Rate Matrix</em> in the Services &amp; Pricing guide.
        </p>
        <Callout>
          Complexity and Rate Matrix are independent of each other and of budget method &mdash; a
          Rate Matrix line still gets its own Complexity multiplier on top of whatever the matched
          band set.
        </Callout>
      </Section>

      <Section id="reading-the-grid" title="Reading the line-item grid">
        <p>
          The <strong>GM%</strong> column color-codes each line&rsquo;s gross margin, calculated
          from Rate, Cost, and Adjusted Rate:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Green</strong> &mdash; 30% or higher.</li>
          <li><strong>Gray</strong> &mdash; 10% up to 30%.</li>
          <li><strong>Red</strong> &mdash; below 10%.</li>
        </ul>
        <p>
          Each line also has a <strong>Calc Type</strong> toggle between per-unit pricing (
          <strong>&times;</strong> &mdash; rate &times; qty &times; visits) and a fixed total (
          <strong>$</strong> &mdash; the entered rate <em>is</em> the line&rsquo;s total,
          regardless of quantity). A fixed line with several visits is the same work repeated: its
          price covers every visit, and its budgeted hours and auto-calculated cost both count every
          visit, so the margin isn&rsquo;t overstated.
        </p>
        <p>
          An <strong>estimate-level flat discount</strong> keeps the amount you typed. If the subtotal
          is smaller than the discount, only the subtotal&rsquo;s worth applies (a note under the field
          says so), and the rest comes back automatically when lines are added. On a Good / Better /
          Best estimate each option is discounted against its own subtotal.
        </p>
        <p>
          Overhead on the estimate as a whole is either one flat percentage applied to total cost,
          or &mdash; when the org has configured any per-type overhead rate &mdash; broken out by
          cost type instead:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Cost type</th>
              <th className="px-3 py-2">Overhead setting used</th>
              <th className="px-3 py-2">Where it comes from</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {COST_TYPES.map(([type, setting, source]) => (
              <tr key={type} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{type}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{setting}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{source}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Both the breakeven labor rate and the per-cost-type overhead percentages are org-wide
          settings, not per-estimate &mdash; the breakeven rate is set from Equipt&rsquo;s Job
          Costing bid-rate calculator (&ldquo;Set as project rates&rdquo;), and overhead percentages
          live in the org&rsquo;s overhead settings.
        </p>
      </Section>

      <Section id="bundles-subitems" title="Service bundles and sub-items">
        <p>
          A <strong>service bundle</strong> is a saved set of line items you can drop onto an estimate.
          Manage them under <strong>Settings → Estimates → Service Bundles</strong>. In the bundle
          editor, click <strong>+ Add sub-item</strong> under any bundle item to attach a product or a
          subservice to it. Search finds your products (not maintenance parts) and your subservices; each
          sub-item has its own quantity (default 1) and rate, and a delete icon when you hover the row.
          When you apply the bundle to an estimate, its sub-items come with it, including when you
          pick it from <strong>Apply bundle&hellip;</strong> on an estimate that already exists.
        </p>
        <p>
          The bundle editor has two tabs. <strong>Details</strong> holds Show when creating, the{" "}
          <strong>Estimate document</strong> and the line items. <strong>Display Settings</strong> holds
          the client-view toggles (visits, quantities, prices and so on) that are copied to the
          estimate when the bundle is used. Choosing an <strong>Estimate document</strong> links the
          bundle to one of your estimate-type documents: estimates built from it remember that
          document, and <strong>Send</strong> pre-selects it (otherwise your default estimate document
          is used).
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Print or hide on the estimate.</strong> On an estimate line, the <em>On estimate</em> /{" "}
            <em>Hidden</em> button beside each sub-item&apos;s name toggles whether it is printed under
            the line on the client&apos;s PDF, the preview and the emailed copy. New sub-items print by
            default; sub-items that existed before this feature stay hidden so old estimates look the same.
          </li>
          <li>
            <strong>Names, descriptions and $0 lines.</strong> A line prints its name in bold with its
            client-facing description underneath (the name is not replaced by the description). A line
            priced entirely through its sub-items has a $0 own total, but it still prints even when
            &quot;hide zero totals&quot; is on, along with its printed sub-items. A sub-item&apos;s price is added on
            top of the line&apos;s own rate, so don&apos;t type the sub-item total into the line&apos;s rate too, or it
            counts twice.
          </li>
          <li>
            <strong>On the job.</strong> When the estimate converts to a job, each service&apos;s
            sub-items copy to the job with their names and quantities only (no prices). The office sees
            them under the service on the job, and the crew sees them on the stop as the products to
            bring and the tasks to do. They don&apos;t bill and don&apos;t change inventory; the sub-item
            dollars are already inside the service price.
          </li>
          <li>
            <strong>Equipment cost.</strong> A line can also carry internal equipment cost, which lowers
            its margin but is never shown to the client. On each equipment row the bold amount is the{" "}
            <strong>charge</strong> (what you type and what the line bills); the cost and margin sit
            beside it in lighter text. See <em>Equipment costs</em> in the Services &amp; Pricing guide.
          </li>
          <li>
            <strong>Line notes box.</strong> The note icon on a line opens Estimate Desc, Job Note,
            Invoice Desc and Line Item tabs. For long quotes press <strong>Bigger</strong> at the top
            right of the box to widen it and make the editor taller; <strong>Smaller</strong> puts it
            back, and the browser remembers your choice.
          </li>
        </ul>
      </Section>

      <Section id="line-subitems" title="Sub-items, equipment and pricing warnings on a line">
        <p>
          Expand an estimate line to add <strong>sub-items</strong> with <strong>+ Add Product / Service</strong>.
          In the dialog, choose <strong>Product</strong> to pick from your product catalog or{" "}
          <strong>Subservice</strong> to pick from your service catalog (or type a custom name). Picking a
          catalog item fills in the name, rate and cost, and you can still change them. For a
          subservice the rate is the service&apos;s default rate and the cost is its default budgeted
          cost.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Sub-items are added on top of the line&apos;s own Rate.</strong> The line&apos;s TP,
            T.Cost and GM% include its sub-items, and so do the estimate totals and the Costs breakdown
            on the right (sub-services under <em>Service</em>, products under <em>Product/Materials</em>).
            If you price a line as one lump sum in Rate and also add sub-items that make up the same
            work, the work is counted twice. Either put the full price in Rate and hide the sub-items,
            or leave Rate to cover only what the sub-items don&apos;t.
          </li>
          <li>
            <strong>Equipment is never billed.</strong> Its charge only counts toward margin, so the
            line&apos;s Rate has to cover it. Example: 40 labor hours at $50 ($2,000, a sub-item), 5
            dump fees at $60 ($300, a sub-item) and $510 of equipment charge gives $2,810 when the line
            Rate is $510.
          </li>
          <li>
            <strong>Where a line&apos;s cost comes from.</strong> When Budgeted Hours are set and Cost is
            left blank, the Cost shows in blue: budgeted hours times your organization&rsquo;s breakeven
            (fully-burdened) labor rate. Typing a number in Cost replaces it. A sub-service&apos;s own cost is
            separate, so a labor sub-item with a $0 cost doesn&apos;t double the line&apos;s labor cost.
          </li>
        </ul>
        <p>
          Under an expanded line, an amber <strong>pricing warning</strong> appears when something
          usually means a mistake. Warnings never block saving.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>The line&apos;s own price is less than the equipment charge on it.</li>
          <li>An hourly catalog subservice is priced below your breakeven labor rate.</li>
          <li>The same catalog product or service appears more than once under the line.</li>
          <li>The line&apos;s costs are higher than its price (a negative margin).</li>
        </ul>
      </Section>

      <Section id="packages-on-estimates" title="Packages on an estimate">
        <p>
          Use <strong>Add Package</strong> (next to Add Item) to quote a package program such as a
          5-Step Fertilization &amp; Weed Control plan. It adds a section header named after the package
          and one line per package service, in package order. Each line keeps the package&rsquo;s
          visit count and per-visit price (the package&rsquo;s own rate, or the service&rsquo;s default
          if the package sets none). Quantity, tier, discounts and the estimate totals work exactly as
          they do on any other line. The package&rsquo;s <strong>Description on Estimate</strong>,
          set in Settings &rarr; Packages, becomes the package&rsquo;s wording on the proposal, and you
          can edit it on the estimate by clicking the description box under the package header.
        </p>
        <p>
          If a package service has a <strong>Rate Matrix</strong> keyed off a property field (such as
          Turf Sq. Ft.) and the estimate&rsquo;s property has a value for it, the matching band prices
          that visit instead of the package&rsquo;s flat price; the visit&apos;s quantity is the
          client&apos;s measurement, and if there is none the package&apos;s own price is kept. A package
          step&apos;s price is per visit and is never multiplied by the client&apos;s square footage. To copy the first visit&rsquo;s Qty,
          Rate, B.Hr, Cost or Adj Rate down to every other visit, use the <strong>copy</strong> buttons
          on the package header. Deleting the package header asks for confirmation, then deletes all of
          its visits, including any hidden by the status tab. A line you add after a package is its own
          line, priced and accepted separately, not part of the package. Adding the same package a second
          time is refused.
        </p>
        <p>
          Each package ends with a <strong>Package subtotal</strong> row for its visits. To skip a
          step, set that visit&rsquo;s status to <strong>Draft</strong>; Draft and Lost visits are left
          out of the subtotal, the estimate total and the proposal. Package visits are indented under
          the header.
        </p>
        <p>
          <strong>Bulk actions.</strong> Tick lines in the grid (the header checkbox selects every
          line, not section headers) and a bar appears above it with <strong>Change Status</strong>,{" "}
          <strong>Rate Increase</strong> and <strong>Delete</strong>. Delete asks for confirmation first.
          The actions apply only to ticked lines that are showing on the current status tab (switching
          tabs clears the ticks), and lines already converted to a job are skipped with a note saying how
          many. A <strong>+$</strong> rate increase raises each line&apos;s total by that amount per
          visit, whatever its unit; on a per-unit line too small to carry the amount in whole cents, use
          a percentage instead.
        </p>
        <p>
          <strong>Deleting a whole estimate.</strong> Open the estimate and click <strong>Delete</strong>{" "}
          (red, in the row of stage buttons), or tick estimates in the list and choose{" "}
          <strong>Actions &gt; Delete Selected</strong>. You need the Edit Estimate permission. The
          estimate leaves your lists, its proposal link stops working, and its follow-up sequences stop;
          if it was made from a ticket, the ticket can be converted again. An estimate that has a job,
          invoice, contract, payment or project made from it can&apos;t be deleted &mdash; cancel or delete
          those first, or mark the estimate Lost if you only want it out of your open pipeline.
        </p>
        <h3 className="text-base font-semibold">What the client sees</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            A package shows as <strong>one main line</strong> &mdash; name, wording and total &mdash;
            with <strong>one checkbox</strong>. A package is all or nothing: the client accepts the
            whole package or none of it, whatever they tick, and the server enforces it.
          </li>
          <li>
            The <strong>Package visits</strong> toggle in the estimate&rsquo;s &ldquo;What the client
            sees&rdquo; settings (off by default) lists each visit under the main line as plain rows.
            Leave it off to show only the name, wording and total. It applies to the proposal page,
            the client portal, the PDF and the <code>[estimategrid]</code> table in emails.
          </li>
          <li>
            Packages added before the toggle existed, or whose section header was removed, print as an
            ordinary section.
          </li>
        </ul>
        <h3 className="text-base font-semibold">Converting</h3>
        <p>
          Converting an accepted package creates a <strong>Package job</strong>, not a plain job. See
          Jobs &amp; Packages for the details. Package lines convert one package at a time, and never in
          the same pass as ordinary lines; the convert window offers a button per package. Duplicating
          an estimate keeps the package tags. The convert window lists each step&apos;s planned visit
          date: if the package&apos;s dates are already in the past the Program Start Date defaults to
          today, and a package with no dated steps can&apos;t be converted until its steps have dates. A
          package service that includes several visits becomes a single step with one visit on the job,
          billed at that line&apos;s full price when the visit is completed.
        </p>
      </Section>

      <Section id="zone-measurements" title="Where zone measurements come from">
        <p>
          Production-rate lines need a quantity to divide by the service&rsquo;s rate &mdash;
          that quantity usually comes from a property&rsquo;s zone measurements: Turf Sq Ft, Mulch
          Bed Sq Ft, Gross Sq Ft, Parking Lot / Hardscape Sq Ft, Linear Ft Perimeter/Edging, Yards of Mulch.
        </p>
        <Callout>
          These are kept on the <strong>client</strong>. Fill them in with{" "}
          <strong>More &rarr; Aerial Measurement</strong> on the client (trace the lawn and beds on
          a satellite map), or type them on the Edit Client dialog&rsquo;s Custom Fields tab. If a
          production-rate line is coming out to 0 budgeted hours, check that the relevant
          measurement is actually filled in on the client&rsquo;s Details tab.
        </Callout>
      </Section>

      <Section id="proposal-link" title="The client-facing proposal link">
        <p>
          Every estimate has a public <strong>proposal page</strong> &mdash; the same page a client
          lands on from the &ldquo;View Your Proposal&rdquo; button in the estimate email, where they
          can review the line items and accept, decline, or request changes online. You don&rsquo;t
          have to send an email to get at it:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Get link / Copy link</strong> in the estimate header puts the proposal URL on your
            clipboard. It reads <strong>Get link</strong> when no live link exists yet (clicking it
            creates one) and <strong>Copy link</strong> once there is. Handing out the link counts as
            sending it: a draft or quote estimate moves to <strong>Sent</strong> (the client can only accept
            a proposal that is Sent), the same as emailing it.
          </li>
          <li>
            <strong>Open</strong> opens that same proposal page in a new tab &mdash; handy for
            checking exactly what the client will see before you send, or for walking a client
            through it on a call.
          </li>
          <li>
            The <strong>&ldquo;N links sent&rdquo;</strong> strip under the header offers the same
            Copy link / Open shortcuts once at least one link has gone out.
          </li>
        </ul>
        <p>
          There is <strong>one live link per estimate</strong>. It&rsquo;s minted the first time you
          ask for it (Get link / Open) or the first time the estimate is emailed, and every later
          copy, open, or send reuses that same URL instead of minting a fresh one &mdash; so a link
          you texted a client last week and the one in this week&rsquo;s reminder email land on the
          same page. A link is good for <strong>30 days</strong>, or until the end of the
          estimate&rsquo;s <strong>Valid until</strong> date if that is later &mdash; and re-sending or
          copying the link extends an existing one the same way. After it expires (or the client
          accepts through it) the next request creates a new one. Once a client has accepted, their
          link <strong>never expires</strong>: it stays viewable read-only as their record of what
          they signed, and is where they pay a deposit that is still due.
        </p>
        <p>
          The link only offers <strong>Accept</strong> while the estimate is in Sent, unchanged since
          it was sent, and within Valid until. If you have moved it back to Draft/Quote or edited it
          after sending, the client sees &ldquo;This proposal is being updated&rdquo; instead of the
          signing form; if it is Lost, &ldquo;no longer open for acceptance&rdquo;. If it was
          accepted another way (in the client portal, or by your office), the link shows it as
          accepted.
        </p>
        <p>
          <strong>The signature is permanent.</strong> When a client accepts through the link, their
          typed name, drawn signature, IP address, browser, the time, and the version number they
          signed are recorded on the link and locked &mdash; nobody, including your admins, can edit
          them afterwards. Every acceptance (and the link&rsquo;s creation, expiry changes and
          retirement) is written to the estimate&rsquo;s <strong>History</strong>.
        </p>
        <p>
          When you email an estimate, the subject line shows names and merge fields as plain text
          (a client called &ldquo;Smith &amp; Sons&rdquo; reads exactly that). CC addresses are
          checked before sending, and the link-expiry setting must be a number of days between 0
          and 3650.
        </p>
        <p>
          <strong>The link shows the last version you sent, not your live edits.</strong> Emailing
          the estimate, or using Get link / Copy link / Open, publishes the estimate as it stands
          right then as a numbered version, and that is what the client sees and can accept. You
          can keep editing a sent estimate without the client seeing a half-finished revision. Once
          you&rsquo;ve edited past it, an amber banner reads &ldquo;Edited since Version N was
          sent&rdquo; and the client still sees Version N &mdash; and can&rsquo;t accept, with a
          message that an updated version is coming &mdash; until you send it again (Send, or Copy
          link). The client portal&rsquo;s Estimates page shows the same last-sent version.
          The version history lists each send, marks links that were shared by link rather than
          email (&ldquo;Shared via link&rdquo;), and tags the version that was accepted with who
          accepted it and whether it was through the proposal link or the portal.
        </p>
        <p>
          <strong>Lines already agreed.</strong> If you re-send an estimate the client has already
          partly accepted (for example after adding more work), the lines they accepted before appear
          under <strong>Already agreed</strong> on the proposal page and in the client portal. They
          can&rsquo;t be unticked, and they&rsquo;re included in the total, so the total on the page is
          what accepting records.
        </p>
        <p>
          <strong>Choosing a tier.</strong> On a Good / Better / Best proposal only the options that
          have lines are shown, the first one is selected to start with, and each option&rsquo;s price
          is its full total (line and estimate discounts, sub-items and tax) &mdash; the same figure as
          the totals box when it&rsquo;s selected. The client portal&rsquo;s Selected Total follows the
          same rules.
        </p>
        <p>
          <strong>Valid until.</strong> The proposal page shows the Valid until date. Through the
          end of that day it can be accepted; after it, the page reads &ldquo;Expired,&rdquo; the
          Accept controls are replaced by a notice, and acceptance (by link or portal) is refused.
          The client can still decline or use <strong>Request changes</strong> to ask for an
          updated proposal. Extend the Valid until date and re-send to reopen it.
        </p>
        <p>
          <strong>Expiry reminders.</strong> About three days before an open estimate&rsquo;s Valid
          until date, the person who created it gets an email and an in-app reminder. An estimate
          with no creator (one that came in through the API, an import or an automation) reminds its
          sales rep instead, provided that rep has a login.
        </p>
        <p>
          <strong>What the client sees.</strong> The page shows the client&rsquo;s billing address
          and the service address, has a <strong>Download PDF</strong> button, and a{" "}
          <strong>Request changes</strong> box. In the estimate&rsquo;s display settings,{" "}
          <strong>Visits</strong>, <strong>Quantities</strong>, and <strong>Units</strong> are now
          three separate toggles for what shows on each line, on the page and the PDF.
        </p>
        <p>
          <strong>Where an estimate&rsquo;s toggles come from.</strong> They are copied onto the estimate
          when it is created or when you pick an Estimate Document or apply a bundle: the
          document&rsquo;s toggles win over the bundle&rsquo;s, and the bundle&rsquo;s win over the org
          default. If you changed the toggles on the <strong>Client View</strong> tab yourself and then
          switch document or apply a bundle, you are asked whether to <strong>Replace toggles</strong> or{" "}
          <strong>Keep mine</strong>. See Documents &amp; Email Templates for the full rules.
        </p>
        <Callout>
          The <strong>Send</strong> dialog&rsquo;s Preview tab renders the real proposal URL behind the
          &ldquo;View Your Proposal&rdquo; button when the estimate already has a live link, so you
          can click straight through from the preview. If no link exists yet, the preview shows a
          labelled placeholder and the link is generated the moment you send.
        </Callout>
      </Section>

      <Section id="deposits" title="Taking a deposit on acceptance">
        <p>
          Set <strong>Deposit Required</strong> on the estimate header and the client is asked for it
          as part of accepting the proposal, before the acceptance is recorded. A deposit is never
          more than what the client is accepting: on a Good/Better/Best proposal it is capped at the{" "}
          <em>package they picked</em> (the figure on the page is exactly what the card is charged),
          and if they untick lines so the accepted total comes in below the deposit, it is capped at
          the accepted total rather than blocking acceptance.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Pay by card</strong> charges the deposit through Stripe there and then. It appears
            once your organisation has finished Stripe Connect setup; the amount always comes from
            the estimate, so the client can&rsquo;t change what they&rsquo;re charged. Your{" "}
            <strong>card processing fee</strong> applies on the same terms as an invoice payment
            (only above your threshold), and the client sees the split &mdash; deposit, fee, total
            &mdash; before confirming. They are credited the <em>deposit</em>; the fee is yours.
          </li>
          <li>
            <strong>Pay by bank transfer (ACH)</strong> appears if you have ACH turned on. No
            processing fee. A bank debit takes a few business days to clear, and the proposal is
            accepted straight away rather than waiting on it &mdash; see below.
          </li>
          <li>
            <strong>The manual methods</strong> (check, cash, ACH, credit card, other) do not charge
            anything. They only record that the client <em>says</em> they&rsquo;re sending it: the
            estimate shows an amber &ldquo;<strong>Client says they&rsquo;ll pay $X by check</strong>&rdquo;
            badge &mdash; never the green Collected badge, which is only for money actually received.
            A promise never counts as a deposit anywhere, so the client can still pay online later.
            Record it as a normal payment when it lands.
          </li>
          <li>
            <strong>Skip for now</strong> accepts the proposal with no deposit at all. A deposit never
            blocks acceptance. But the deposit is still <strong>shown as due</strong>: on the
            client&rsquo;s accepted proposal page (with Pay by card / bank transfer buttons when online
            payment is set up) and on their client-portal Estimates page. You and the sales rep get an{" "}
            <strong>Accepted without deposit</strong> notification and email so someone follows up.
          </li>
        </ul>
        <p>
          <strong>Accepting in the client portal</strong> works the same way: the signing dialog says a
          deposit is due, accepting doesn&rsquo;t wait for it, and the estimate then shows{" "}
          &ldquo;Deposit due&rdquo; with a <strong>Pay online</strong> link (the proposal link) when one
          has been sent. Staff are notified exactly as for a skipped deposit.
        </p>
        <Callout>
          <strong>A card deposit becomes a prepayment, not an invoice payment.</strong> It&rsquo;s
          taken at acceptance, before any invoice for the work exists, so there is nothing to apply it
          to yet. It lands as a payment on the client with the full amount unapplied, and shows in the{" "}
          <strong>Prepayments</strong> figure on their record (not Credits &mdash; that line is for
          overpayments and goodwill credits). If you refund it before it&rsquo;s used, the refund
          comes out of the unapplied amount and no invoice is touched.
        </Callout>
        <Callout>
          <strong>A deposit is reserved for its estimate.</strong> It can only be applied to invoices
          for that estimate &mdash; the estimate itself, the job or project converted from it, or a
          contract made from it. It isn&rsquo;t offered on the client&rsquo;s other invoices, and an
          automatic card or bank charge on another invoice never spends it. The estimate shows a blue
          &ldquo;<em>$X reserved for this estimate</em>&rdquo; badge while it&rsquo;s unused. If the
          estimate is then marked <strong>Lost</strong> with the deposit still unused, a red banner on
          the estimate prompts you to <strong>refund it</strong> (Accounting &rarr; Payments) or{" "}
          <strong>Release to general credit</strong>, after which it can pay any of the client&rsquo;s
          invoices.
        </Callout>
        <p>
          <strong>Using it on the first invoice is a manual step</strong> &mdash; nothing is applied
          for you, because a converted job invoices its <strong>full</strong> amount with the deposit
          not deducted. The invoice tells you when there&rsquo;s money waiting:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open the invoice. If the client has unapplied money, a blue bar reads{" "}
            &ldquo;<em>$2,000.00 of unapplied payments on this client (including a deposit) &mdash;
            $2,000.00 can go to this invoice</em>&rdquo;.
          </li>
          <li>
            Click <strong>Apply to this invoice</strong>. It uses the oldest money first, so a
            deposit is consumed before a later overpayment, and never applies more than the invoice
            still owes.
          </li>
          <li>
            The balance drops and the unapplied figure drops to match. Anything left over stays
            available for the next invoice. You can still do it the long way &mdash; open the payment
            and edit its allocation &mdash; if you want to split it differently.
          </li>
        </ol>
        <Callout>
          Apply the deposit <em>before</em> you send the invoice. Nothing stops an invoice going out
          at its full amount with a deposit sitting unused against the client.
        </Callout>
        <Callout>
          <strong>A bank transfer doesn&rsquo;t hold up acceptance.</strong> ACH takes a few business
          days to clear, and the proposal is accepted the moment the client submits the debit &mdash;
          they aren&rsquo;t left waiting and neither is the job. While it&rsquo;s clearing the estimate
          shows an amber <strong>bank transfer pending</strong> badge next to Deposit Required: no
          payment exists on the client yet, because the money hasn&rsquo;t actually arrived. When it
          clears it becomes a normal prepayment and the badge turns green.
        </Callout>
        <p>
          <strong>If the deposit fails</strong> &mdash; a returned bank transfer (insufficient funds,
          closed account, a mistyped routing number) or a declined card &mdash; the proposal{" "}
          <em>stays accepted</em>. Only the money failed; nothing needs signing again. Four things
          happen:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            The estimate shows a red <strong>payment failed</strong> badge with the amount, the date,
            and the bank&rsquo;s own reason on hover. That reason is the useful part &mdash;
            &ldquo;insufficient funds&rdquo; means ask them to try again, &ldquo;account
            closed&rdquo; means pick up the phone.
          </li>
          <li>
            The client is emailed that their deposit didn&rsquo;t go through, with the reason and a{" "}
            <strong>Pay deposit</strong> button back to their proposal link (unless their address has
            hard-bounced). The email is listed in the estimate&rsquo;s email history.
          </li>
          <li>
            You&rsquo;re notified &mdash; a <strong>Deposit failed</strong> bell notification and an
            email, to whoever already receives proposal-decision notifications, plus the
            estimate&rsquo;s sales rep. Both can be turned off individually under{" "}
            <GuideLink href="/settings/support/notification-preferences-guide" className="text-[#60ab45] hover:underline">
              Notification Preferences
            </GuideLink>
            .
          </li>
          <li>
            <strong>The client&rsquo;s original proposal link re-opens itself</strong> so they can pay
            it again. Re-visiting it shows a &ldquo;your deposit didn&rsquo;t go through&rdquo; screen
            with the reason and the card / bank-transfer buttons, instead of the usual thank-you.
            They can&rsquo;t change the amount, and there&rsquo;s no Skip button this time &mdash;
            skipping is a choice made before accepting, and by now the deposit is owed.
          </li>
        </ol>
        <Callout>
          The link closes again the moment a deposit is recorded, so it only ever allows one attempt
          at a time. This is worth knowing before you chase someone: they very likely can just pay it
          from the same link you already sent, and don&rsquo;t need a new one. An accepted link never
          expires, so this holds however late the bank returns the debit.
        </Callout>
        <Callout>
          <strong>Paid, but not accepted.</strong> The card is charged just before the acceptance is
          submitted. If the proposal expired, or you edited the estimate after sending it, in those
          few moments, the acceptance is refused but the deposit is real: it sits on the client as
          unapplied credit and you get a <strong>Deposit paid, not accepted</strong> bell notification
          (same recipients as proposal decisions, plus the sales rep). Re-send the proposal or refund
          the deposit.
        </Callout>
        <Callout>
          If you change the deposit amount (or the card fee setting) while a client has a card
          payment half-started, their next attempt is for the new amount &mdash; the old pending
          payment is cancelled rather than reused, so they&rsquo;re never charged the old figure.
        </Callout>
        <Callout>
          Only the card and bank-transfer paths are real money. A client who picks
          &ldquo;Credit Card&rdquo; from the manual list has told you they paid by card{" "}
          <em>somewhere else</em> &mdash; nothing was charged here. The proposal page says so beneath
          those options whenever online payment is available.
        </Callout>
      </Section>

      <Section id="estimate-defaults" title="What a new estimate starts with">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Tax rate.</strong> A new estimate starts at the client&rsquo;s default tax rate, or at no
            tax if the client is marked tax-exempt (<strong>Client is taxable</strong> unchecked). You can
            change it on the estimate.
          </li>
          <li>
            <strong>Good / Better / Best.</strong> Before the client chooses a tier, the estimate total, tax
            and pipeline value use the lowest-priced tier (&ldquo;starting at&rdquo;). That comparison now
            includes each tier&rsquo;s priced sub-items, so a tier with large sub-items is no longer mistaken
            for the cheapest.
          </li>
          <li>
            <strong>Photos.</strong> iPhone HEIC photos are accepted on an estimate&rsquo;s Photos tab and
            converted to JPEG on upload, so they also show in the PDF and the emailed proposal.
          </li>
        </ul>
      </Section>

      <Section id="estimate-limits" title="Rate and probability limits">
        <p>
          The estimate&rsquo;s <strong>tax rate</strong>, <strong>overhead rate</strong>, and{" "}
          <strong>win probability</strong> are percentages limited to 0&ndash;100%. A value outside
          that range is clamped when you leave the field, so a typo like 825 can&rsquo;t multiply
          through the totals.
        </p>
      </Section>

      <Section id="converting" title="Converting an estimate to a job">
        <p>
          Once an estimate is <strong>Accepted</strong> &mdash; whether you set the stage yourself or
          the client accepted online through the proposal link &mdash; a{" "}
          <strong>Convert to Job</strong> button appears in the estimate header. After a job has been
          created from the estimate, that same button reads <strong>View Job</strong> and jumps
          straight to it, so an estimate is never converted twice by accident.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            From the accepted estimate, click <strong>Convert to Job</strong>.
          </li>
          <li>
            Choose which line items to include &mdash; not every accepted line has to become part
            of the job. Lines that net out to <strong>$0</strong> start unchecked so they don&rsquo;t
            land on the job (and its invoice) as empty rows; tick them if you really want them.
            Lines the client declined (a tier or option they unchecked) and lines still marked
            Draft, which were never part of the quote, are not offered at all, and Draft lines are
            also left out when you create an invoice from the estimate.
          </li>
          <li>
            Pick a <strong>Job Type</strong>: One Time, Recurring, Project, or Waiting List. An
            estimate that already bills on its own converts only as a <strong>Project</strong> (the
            Job Type is locked and the window says why): one with a live invoice created from it
            (&ldquo;This estimate has already been invoiced (#N)&rdquo;), or one set to bill by{" "}
            <strong>milestones</strong>. Project jobs aren&rsquo;t invoiced per visit and take over the
            estimate&rsquo;s milestones when you link a project, so the client isn&rsquo;t billed twice.
            Void the invoice first if you really want a regular job.
          </li>
          <li>
            Set the scheduled date, assign a crew, and enter a <strong>Crew Size (men)</strong>. The
            crew size is written onto the job and its first visit, so the Dispatch Board&rsquo;s Men
            column is right from day one instead of reading 0.
          </li>
          <li>
            Confirm. The job is created and a <strong>&ldquo;Job created&rdquo;</strong> entry is
            logged on the client&rsquo;s Activity timeline.
          </li>
        </ol>
        <Callout>
          <strong>Discounts carry over.</strong> The job&rsquo;s price is what the client actually
          agreed to pay: each included line&rsquo;s own discount <em>and</em> its share of any
          estimate-level discount are applied to the job&rsquo;s service pricing. A 10%-off estimate
          produces a job priced 10% off, not one priced at the undiscounted subtotal.
        </Callout>
        <Callout>
          <strong>Invoicing straight from the estimate.</strong> Each invoice line gets a quantity and
          rate that multiply exactly to the estimate line&rsquo;s total &mdash; for a per-unit line,
          quantity &times; visits units at the per-unit rate the total works out to (Adj Rate and
          complexity included); for a fixed line, or when that rate isn&rsquo;t a whole number of
          cents, 1 &times; the line total. Editing anything on the invoice line then keeps its price.
        </Callout>
        <Callout>
          <strong>A multi-visit line becomes a per-visit price.</strong> An estimate line priced
          across several visits &mdash; 30 mows at $60 &mdash; is quoted to the client as the full
          $1,800, but the job stores <strong>$60 per visit</strong>, because that is what each
          completed visit invoices. The quantity and the number of visits are both divided back out,
          so quantity × rate × visits still equals the amount the client accepted, discounts
          included. If you are reconciling a converted job against its estimate, compare the
          estimate&rsquo;s line total against rate × visits, not against the per-visit rate.
        </Callout>
        <Callout>
          <strong>Snow</strong> jobs aren&rsquo;t created this way &mdash; they&rsquo;re created
          directly from <strong>Jobs &rarr; Add Job</strong>. <strong>Package</strong> jobs are
          created here when the estimate has a package on it (<strong>Add Package</strong>): the
          convert window locks Job Type to Package, takes the package&rsquo;s lines one package per
          pass, and treats Scheduled Date as the program start.
        </Callout>
      </Section>
      <Section id="good-to-know" title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Package totals on the proposal.</strong> A package&apos;s printed total includes its visits&apos; sub-items and line discounts, so it matches the estimate total.
          </li>
          <li>
            <strong>Client-view toggles.</strong> Picking an Estimate Document or applying a bundle only asks whether to replace the client-view toggles when someone actually changed them on this estimate.
          </li>
          <li>
            <strong>Estimate emails.</strong> Client documents used as the Estimate Email or Confirmation Email offer the estimate merge tags and a “View proposal” button link. If the confirmation document linked to an estimate document is deleted, the picker says so; until you choose another, the company&apos;s Accepted Email (or the built-in one) is sent.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
