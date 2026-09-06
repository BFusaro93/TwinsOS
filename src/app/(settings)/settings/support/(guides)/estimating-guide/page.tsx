import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const STAGES: [string, string][] = [
  ["Draft", "Default stage for a brand-new estimate. Still being built — line items and pricing are in flux. Drafts were never presented to a client, so Close Ratios and win-rate figures leave them out of both counts and amounts."],
  ["Quote", "Set manually once the estimate is ready for internal review — the numbers are considered final pending sign-off."],
  ["Sent", "Set when the estimate is actually delivered to the client (email, PDF, or the client portal). Blocked from actually going out if Approval Status is still Pending — see the callout below. Pipeline dashboards count Sent estimates as open pipeline alongside Draft and Quote."],
  ["Accepted", "Set when the client accepts — in full or via a tiered/partial acceptance. Converting to a job normally happens from here."],
  ["Lost", "Set when the client declines — including a Decline in the client portal, which records the reason “Declined by client via portal” — or when an estimate is manually marked dead. Line items already marked “lost” individually (e.g. a tier the client unchecked when accepting) don’t count toward totals, and the Accepted Estimates by Service reports skip them."],
  ["Invoiced", "Set once billing has started against the estimate (a deposit, milestone, or the full amount has been invoiced)."],
];

const COST_TYPES: [string, string, string][] = [
  ["Labor", "Labor Overhead + Labor Burden", "Line items’ modeled cost (totalCostCents) is bucketed here, alongside any Direct Cost rows typed as Labor."],
  ["Sub-Contract", "Contract Overhead", "Subcontracted work entered as a Direct Cost."],
  ["Product/Material", "Materials Overhead", "Materials entered as a Direct Cost."],
  ["Asset/Equipment", "Equipment Overhead", "Equipment costs entered as a Direct Cost."],
  ["Service/Other", "Other Overhead", "Direct Costs typed as Service or Other — there’s no dedicated bucket for “Service,” so it shares Other’s rate."],
];

export default function EstimatingGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Estimates & the Budget Engine"
        description="How an estimate is built, how its numbers are actually calculated, and how it becomes a job."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#creating">Creating an estimate</TOCLink>
          <TOCLink href="#stage-vs-approval">Stage vs. approval status</TOCLink>
          <TOCLink href="#budget-methods">Manual vs. production-rate budgeting</TOCLink>
          <TOCLink href="#worked-example">A worked example, start to finish</TOCLink>
          <TOCLink href="#why-snapshot">Why budget method is snapshotted per-line</TOCLink>
          <TOCLink href="#reading-the-grid">Reading the line-item grid</TOCLink>
          <TOCLink href="#zone-measurements">Where zone measurements come from</TOCLink>
          <TOCLink href="#converting">Converting an estimate to a job</TOCLink>
        </div>
      </div>

      <Section id="creating" title="Creating an estimate">
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
          </li>
          <li>
            Assign a <strong>sales rep</strong>.
          </li>
        </ol>
        <p>
          From there you&rsquo;re in the estimate detail view, where line items, direct costs, and
          the summary panel all live.
        </p>
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
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Approval Status runs on its own track: <strong>Not Required</strong>,{" "}
          <strong>Pending</strong>, <strong>Approved</strong>, or <strong>Rejected</strong>. It
          exists to hold an estimate back regardless of what stage says.
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
            <code>hours = quantity &divide; the service&rsquo;s sq ft per man-hour</code>.
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
          regardless of quantity).
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
              <tr key={type} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{type}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{setting}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{source}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Both the breakeven labor rate and the per-cost-type overhead percentages are org-wide
          settings, not per-estimate &mdash; the breakeven rate is set from Equipt&rsquo;s Job
          Costing bid-rate calculator (&ldquo;Set as project rate&rdquo;), and overhead percentages
          live in the org&rsquo;s overhead settings.
        </p>
      </Section>

      <Section id="zone-measurements" title="Where zone measurements come from">
        <p>
          Production-rate lines need a quantity to divide by the service&rsquo;s rate &mdash;
          that quantity usually comes from a property&rsquo;s zone measurements: Turf Sq Ft, Mulch
          Bed Sq Ft, Gross Sq Ft, Linear Ft Perimeter/Edging, Yards of Mulch.
        </p>
        <Callout>
          These are entered on the <strong>client&rsquo;s Custom Fields tab</strong>, not in the
          Add Property dialog and not in a dedicated per-zone editor &mdash; there currently isn&rsquo;t
          one. If a production-rate line is coming out to 0 budgeted hours, check that the relevant
          measurement is actually filled in there.
        </Callout>
      </Section>

      <Section id="converting" title="Converting an estimate to a job">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            From the estimate, click <strong>Convert Estimate to Job</strong>.
          </li>
          <li>
            Choose which line items to include &mdash; not every accepted line has to become part
            of the job.
          </li>
          <li>
            Pick a <strong>Job Type</strong>: One Time, Recurring, Project, or Waiting List.
          </li>
          <li>
            Set the scheduled date and assign a crew, then confirm.
          </li>
        </ol>
        <Callout>
          <strong>Package</strong> and <strong>Snow</strong> jobs aren&rsquo;t created this way
          &mdash; they&rsquo;re created directly rather than converted from an estimate.
        </Callout>
      </Section>
    </DocsFontScope>
  );
}
