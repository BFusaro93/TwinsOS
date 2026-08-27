import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const PROJECT_FIELDS: [string, string][] = [
  ["Project Name", "Free text — e.g. \"Smith Residence Backyard Renovation.\""],
  ["Customer / Client Name", "Free text field (not a dropdown of CRM Clients). A project can separately carry a Client ID for billing — see below."],
  ["Address / City / State / Zip", "Job site location."],
  ["Status", "Sold, Scheduled, In Progress, On Hold, Complete, or Canceled."],
  ["Start Date / End Date", "End Date defaults to \"TBD\" until set."],
  ["Contract Price", "What the customer is paying — used to compute margin/net profit once costs are in."],
  ["Budget Hours", "Planned labor hours, compared against Actual Hours for a variance once logged."],
  ["Notes", "Optional free text."],
];

const PROJECT_TABS: [string, string, string][] = [
  ["Details", "Purchasing & CRM", "Status flow, budget vs. actual hours, labor rates, and the Contract Price / Cost / Net Profit summary."],
  ["Materials", "Purchasing", "Every Requisition, PO, or direct line item assigned to this project, with running Subtotal / Sales Tax / Shipping / Total."],
  ["Other Costs", "Purchasing", "Subcontractor costs entered manually — Materials, Labor, or Other — each with an optional linked Vendor."],
  ["Milestones", "CRM", "Currently a placeholder: \"Sub-jobs and milestones … will appear here.\" Jobs are assigned to a project from the Dispatch Board or a Job's detail panel, not from this tab."],
  ["Billing", "CRM", "Invoices and payments for the project's linked Client, filtered by type (All / Invoice / Payment / Credit). Requires the project to have a Client ID — without one this tab shows nothing rather than unrelated org-wide billing."],
  ["Analysis", "CRM", "Total Invoiced, Total Payments, and Amount Due for the linked client, alongside the project overview."],
  ["Comments & History", "Purchasing", "Comment thread plus the full audit trail for the project record."],
  ["Files", "Purchasing", "Attachments."],
];

export default function ProjectsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Purchasing"
        title="Projects & Job Costing"
        description="One Projects table, two different screens to view it from, and a separate rate-calculator tool that feeds it — untangled."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#two-concepts">Two things named &quot;Project&quot;</TOCLink>
          <TOCLink href="#creating-a-project">Creating a Project</TOCLink>
          <TOCLink href="#assigning-costs">Assigning costs to a Project</TOCLink>
          <TOCLink href="#worked-example">Worked example: Smith Residence</TOCLink>
          <TOCLink href="#materials-other-costs">The Materials &amp; Other Costs tabs</TOCLink>
          <TOCLink href="#crm-view">The CRM view of a Project</TOCLink>
          <TOCLink href="#job-costing-dashboard">The Job Costing Dashboard</TOCLink>
          <TOCLink href="#reference">Field &amp; tab reference</TOCLink>
        </div>
      </div>

      <Section id="two-concepts" title="Two things named &quot;Project&quot;">
        <p>
          The word &quot;Project&quot; is overloaded in this platform, and that&apos;s the single biggest
          source of confusion here. Two unrelated things share the name:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>The Projects table.</strong> A single set of records — one landscaping job or
            contract each — used for cost tracking. There is only one <code>projects</code> table
            in the database. It has two screens onto it: <strong>Purchasing &gt; Projects</strong> (this
            module — procurement-focused: Materials and Other Costs) and{" "}
            <strong>CRM &gt; Scheduling &gt; Projects</strong> (client-focused: Milestones, Billing,
            Analysis). Open a project from either screen and you&apos;re looking at the same
            underlying record — just a different set of tabs layered on top depending on where you
            came from.
          </li>
          <li>
            <strong>&quot;Project&quot; as a CRM Job type.</strong> A CRM Job (a scheduled visit for a
            client) has a <code>type</code> of <code>recurring</code>, <code>one_time</code>,{" "}
            <code>waiting_list</code>, <code>package</code>, <code>snow</code>, or <code>project</code>.
            This is a scheduling classification — it just marks the job as one-off project work
            rather than recurring service. It is a completely separate field from the Projects
            table above. A CRM Job of <em>any</em> type — including one whose type happens to be
            &quot;project&quot; — can optionally be linked to a Project record for cost tracking, via a
            <code> Project ID</code> field on the job. The two are independent: a recurring job can
            link to a Project, and a job typed &quot;project&quot; doesn&apos;t have to.
          </li>
        </ol>
        <Callout>
          <strong>Rule of thumb.</strong> If someone says &quot;the project,&quot; they almost always
          mean the Projects-table record — the cost-tracking bucket described in the rest of this
          page. &quot;Project-type job&quot; only comes up when talking specifically about CRM Job
          scheduling classifications.
        </Callout>
      </Section>

      <Section id="creating-a-project" title="Creating a Project">
        <p>
          From either screen, click <strong>+ New Project</strong>. The dialog is the same form
          either way, since it&apos;s writing to the same table.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Notes</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {PROJECT_FIELDS.map(([field, note]) => (
              <tr key={field} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{field}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{note}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A project&apos;s status runs through a flow — Sold → Scheduled → In Progress → Complete —
          with On Hold and Canceled as side branches, shown as a step indicator on the Details tab.
        </p>
      </Section>

      <Section id="assigning-costs" title="Assigning costs to a Project">
        <p>
          Projects don&apos;t hold costs directly — they roll them up from other records. When adding
          a line item to a Requisition or a Purchase Order, each line has an optional{" "}
          <strong>Project</strong> field. Setting it assigns that line&apos;s cost to the project.
        </p>
        <Callout>
          Only line items in the <strong>Stocked Material</strong> and <strong>Project Material</strong>{" "}
          product categories can carry a Project — this is enforced by a database constraint, not
          just a UI convention. <strong>Maintenance Part</strong> lines can never be
          project-assigned, since they feed CMMS parts inventory instead.
        </Callout>
        <p>
          Materials can also be added straight from the project itself — the Materials tab&apos;s{" "}
          <strong>Add Material</strong> button lets you send items directly onto the project (a
          &quot;direct&quot; line with no source document), onto an existing Requisition or PO, or
          into a brand-new Requisition or PO pre-filled with those items and this project already
          set on every line.
        </p>
      </Section>

      <Section id="worked-example" title="Worked example: Smith Residence Backyard Renovation">
        <p>A project pulls cost together from however many source documents touch it:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Create the project: <strong>Smith Residence Backyard Renovation</strong>, customer
            &quot;Smith,&quot; a Contract Price, and a start date.
          </li>
          <li>
            <strong>PO #1</strong> — a paver order from the hardscape supplier. Two line items
            (category <code>project_material</code>) are each tagged with this project.
          </li>
          <li>
            <strong>PO #2</strong> — mulch and plants from the nursery, placed a week later. Its
            line items are tagged with the same project.
          </li>
          <li>
            <strong>PO #3</strong> — a follow-up order for extra edging once the crew realized more
            was needed. Tagged the same way.
          </li>
          <li>
            Open the project and switch to its <strong>Materials</strong> tab: all line items from
            all three POs appear in one table, each showing its item, quantity, unit cost, and
            which PO it came from (a clickable badge that opens that PO). The Subtotal, Sales Tax,
            an allocated share of each PO&apos;s Shipping cost, and a grand Materials Total are
            computed live underneath.
          </li>
          <li>
            As each PO is received, the same numbers keep reflecting committed vs. received spend —
            there&apos;s nothing further to do on the project itself to keep the rollup current.
          </li>
        </ol>
        <p>
          If a subcontractor also poured a patio slab for this job, that cost has no PO — it goes on
          the project&apos;s <strong>Other Costs</strong> tab instead, as its own line (vendor,
          description, cost type, amount), separate from the Materials rollup but included in the
          project&apos;s total cost on the Details tab.
        </p>
      </Section>

      <Section id="materials-other-costs" title="The Materials &amp; Other Costs tabs">
        <p>
          The Materials tab merges three kinds of line items into one view: Requisition lines,
          PO lines, and &quot;direct&quot; lines added straight to the project (no source document).
          Requisitions that have already been converted into a PO are excluded, so a converted
          requisition&apos;s items don&apos;t show up twice.
        </p>
        <p>Rows behave differently depending on where they came from:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Direct items</strong> can be edited or deleted right from the project.
          </li>
          <li>
            <strong>Requisition / PO items</strong> can only be viewed here — editing quantity or
            cost, or removing the line, has to happen on the source Requisition or PO itself. The
            row&apos;s Source badge opens that document directly.
          </li>
        </ul>
        <p>The Materials Total is built from:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Subtotal</strong> — quantity × unit cost, summed across every line.</li>
          <li>
            <strong>Sales Tax</strong> — each line&apos;s source document&apos;s tax rate, applied only
            to lines still marked taxable (non-taxable items like pallet deposits or delivery fees
            are excluded).
          </li>
          <li>
            <strong>Shipping</strong> — a PO&apos;s shipping cost is allocated across every project it
            touches, proportional to that project&apos;s share of the PO&apos;s subtotal.
          </li>
        </ul>
        <p>
          The <strong>Other Costs</strong> tab is a flat, manually-entered list — no product catalog
          involved — grouped into Materials, Labor, or Other, each optionally tied to a Vendor. Its
          own subtotal by type feeds into the project&apos;s overall cost on the Details tab, alongside
          the Materials Total.
        </p>
      </Section>

      <Section id="crm-view" title="The CRM view of a Project">
        <p>
          Opening the same project from <strong>CRM &gt; Scheduling &gt; Projects</strong> shows
          Details and Materials/Other Costs as before, plus three CRM-oriented tabs: Milestones,
          Billing, and Analysis.
        </p>
        <p>
          <strong>Milestones</strong> is currently a placeholder — the CRM Projects list surfaces it
          as a future home for sub-jobs, with a note that jobs get assigned to a project from the
          Dispatch Board or a Job&apos;s own detail panel, not from this tab.
        </p>
        <p>
          <strong>Billing</strong> and <strong>Analysis</strong> both depend on the project having a
          <strong> Client ID</strong> set — a link to a CRM Client record, separate from the project&apos;s
          free-text customer name field. Without a Client ID, Billing shows nothing at all (by
          design, so it doesn&apos;t show unrelated org-wide activity), and Analysis has no invoices or
          payments to total.
        </p>
        <Callout>
          A project&apos;s <strong>Contract Price</strong> is entered manually on the project — it is
          not derived from actual Invoices. Billing/Analysis show real invoice and payment activity
          for the linked client alongside it, but nothing here keeps Contract Price in sync with
          what&apos;s actually been invoiced.
        </Callout>
      </Section>

      <Section id="job-costing-dashboard" title="The Job Costing Dashboard">
        <p>
          Separate from Projects entirely, <strong>Job Costing</strong> is a labor rate calculator —
          it computes a break-even hourly rate and a bid rate from wage, overtime, payroll burden
          (FICA, Workers&apos; Comp, SUI, FUI, PFML), overhead, and target profit inputs. It is a
          season-level pricing tool, not a per-project cost record — it has no concept of an
          individual job or project.
        </p>
        <p>This is a live, current tool with a direct, working connection into Projects:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            The <strong>Rate Calculator</strong> tab shows Bid Rate, Break-Even rate, and Billable
            Hours as you adjust inputs, with a chart breaking the bid rate down into Direct Labor,
            Payroll Burden, OH Payroll, Other OH, Liabilities, and Profit per hour.
          </li>
          <li>
            Clicking <strong>&quot;Set as project rate&quot;</strong> next to the Break-Even figure
            saves that number as the org&apos;s default labor rate (<code>breakevenLaborRateCents</code>{" "}
            in org settings). Every project&apos;s Details tab uses this org-level rate for its labor
            cost and net-profit math, unless that specific project has its own rate saved (projects
            snapshot a rate at creation and allow editing it per-project from the Details tab).
          </li>
          <li>
            The <strong>Scenarios</strong> tab lets you save named input sets (e.g. &quot;2026 Budget —
            Landscape Season,&quot; &quot;2025 Actual&quot;) and reload them into the calculator. These
            scenarios live only in the page&apos;s local state for the current session — they are not
            saved to the database, so they reset on reload rather than persisting like a project or
            PO would.
          </li>
        </ul>
        <Callout>
          Job Costing is reachable from three different routes (Operations, Tools, and Dashboards)
          — all three point at the exact same component, so it behaves identically no matter where
          you opened it from.
        </Callout>
      </Section>

      <Section id="reference" title="Field &amp; tab reference">
        <p>Every tab available on a Project record, and which screen surfaces it:</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Tab</th>
              <th className="px-3 py-2">Surfaced in</th>
              <th className="px-3 py-2">What it shows</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {PROJECT_TABS.map(([tab, where, desc]) => (
              <tr key={tab} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{tab}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#4a4a46]">{where}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </DocsFontScope>
  );
}
