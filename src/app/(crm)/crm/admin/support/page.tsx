import type { ReactNode } from "react";

function TOCLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="block text-sm text-brand-600 hover:underline">
      {children}
    </a>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

export default function Page() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <p className="text-sm text-slate-500">Help and support resources</p>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">On this page</h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overhead-recovery">Estimating: Overhead Recovery (Flat Rate vs. Per Cost Type)</TOCLink>
          <TOCLink href="#labor-rates">Labor Rates &amp; the Cost Auto-Fill</TOCLink>
          <TOCLink href="#cost-field">Understanding the Cost Field on Estimate Line Items</TOCLink>
        </div>
      </div>

      <Section id="overhead-recovery" title="Estimating: Overhead Recovery (Flat Rate vs. Per Cost Type)">
        <p>
          Overhead Recovery is how an estimate accounts for the indirect costs of running the business
          (office staff, insurance, equipment depreciation, rent, etc.) on top of the direct costs of a
          specific job (labor, materials, subcontractors). There are two independent methods for applying
          it, configured in <strong>Settings → Estimates → Overhead Recovery</strong> (available in both
          Equipt and Landscapt settings — it&apos;s the same org-wide setting either way).
        </p>

        <h3 className="mt-2 font-semibold text-slate-800">Flat Rate</h3>
        <p>
          A single percentage, typed directly on each individual estimate&apos;s Financial Settings panel
          (the &quot;Overhead Rate %&quot; field). It applies uniformly to that estimate&apos;s entire cost
          base — labor, materials, subcontractors, everything treated the same. You can also set a{" "}
          <strong>Default Flat Overhead Rate %</strong> in Settings so new estimates pre-fill with your
          standard rate instead of 0%, saving you from typing it every time.
        </p>

        <h3 className="mt-2 font-semibold text-slate-800">Per Cost Type</h3>
        <p>
          Six separate percentages, configured once, org-wide, in Settings: Labor Overhead %, Labor
          Burden %, Subcontract/Contract OH%, Equipment OH%, Materials OH%, and Other OH%. Each direct
          cost on an estimate is tagged with a <strong>cost type</strong> (not a service) — labor cost,
          material cost, subcontractor cost, equipment cost, or other — and gets its own overhead
          percentage applied based on that tag. Two different services&apos; labor costs both get the
          same Labor Overhead %, but a service&apos;s labor cost and its materials cost can get different
          rates from each other.
        </p>

        <h3 className="mt-2 font-semibold text-slate-800">Which one applies?</h3>
        <p>
          This is <strong>not</strong> a per-estimate toggle you pick — it&apos;s automatic and org-wide:
        </p>
        <ul className="list-disc pl-5">
          <li>
            If <strong>any</strong> of the six Per Cost Type percentages is set above 0%, Per Cost Type
            mode takes over for <strong>every</strong> estimate in the org, and each estimate&apos;s own
            flat Overhead Rate % field is ignored (shown grayed out with a note explaining why).
          </li>
          <li>
            If all six Per Cost Type percentages are 0%, every estimate falls back to its own Flat Rate
            field.
          </li>
        </ul>

        <Callout>
          <strong>Already recovering overhead through your labor rate?</strong> If you use the Job Costing
          Calculator (Tools) to bake overhead recovery directly into your hourly billing rate, leave{" "}
          <em>all seven</em> percentages (the six Per Cost Type fields, plus the Default Flat Overhead
          Rate %) at 0%. Otherwise overhead gets recovered twice — once inside your rate, and again as a
          separate deduction on every estimate — silently understating your true margin.
        </Callout>
      </Section>

      <Section id="labor-rates" title="Labor Rates & the Cost Auto-Fill">
        <p>
          Two org-wide labor rates, editable from either Equipt Settings (General → Finance) or Landscapt
          Settings (Estimates → Labor Rates) — it&apos;s the same underlying setting either way:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Breakeven Labor Rate</strong> — fully-loaded cost per hour: wages + payroll burden +
            non-billable uplift + fixed overhead recovery. This is the rate used to auto-fill an estimate
            line item&apos;s Cost.
          </li>
          <li>
            <strong>Burdened Labor Rate</strong> — wages + burden + non-billable uplift only, no overhead
            recovery baked in. Used for project labor-cost defaults on the Equipt side.
          </li>
        </ul>
        <p>
          On any estimate line item, if you leave <strong>Cost</strong> at exactly <strong>$0</strong> and
          set <strong>Budgeted Hours</strong>, the system automatically computes:
        </p>
        <p className="rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          Total Cost = Budgeted Hours × Breakeven Labor Rate
        </p>
        <p>
          The Cost cell shows the resulting figure in blue once you click away from it — that&apos;s the
          auto-fill confirming, not an error. Typing any other number into Cost yourself switches that
          line out of auto mode and locks in your manually-entered value going forward.
        </p>
      </Section>

      <Section id="cost-field" title="Understanding the Cost Field on Estimate Line Items">
        <p>
          The single most common point of confusion: <strong>Cost is a per-unit rate, not a lump-sum
          total.</strong> The system always computes:
        </p>
        <p className="rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          Total Cost = Cost × Qty × Visits
        </p>
        <p>
          If a line item is priced at 325 sqft and you want the job&apos;s total labor cost to come out to
          $5,541.60, do <strong>not</strong> type $5,541.60 directly into Cost — that gets multiplied by
          325 again. Instead, either:
        </p>
        <ul className="list-disc pl-5">
          <li>
            Leave Cost at $0 and set Budgeted Hours — let the auto-fill (see above) compute the correct
            total for you, independent of Qty, or
          </li>
          <li>
            If entering a per-unit rate manually, divide your target total by Qty × Visits first.
          </li>
        </ul>
        <p>
          For a job-wide cost that isn&apos;t modeled per-line (a subcontractor invoice, equipment rental,
          a permit fee), use <strong>Direct Costs</strong> instead of the line item&apos;s Cost field —
          Direct Costs are entered as their own total (Qty × Rate = Total, no hidden per-unit semantics)
          and still correctly deduct from Gross/Net Profit. The tradeoff: Direct Costs aren&apos;t tied to
          a specific line item&apos;s Budgeted Hours, so they won&apos;t feed the Job Costing/COGS
          reports&apos; hours-based variance metrics the way a line item&apos;s own Cost + Budgeted Hours
          does.
        </p>
        <p>
          <strong>Break Even</strong> (shown in the Estimate Summary panel) = full cost base (all line
          items&apos; cost + all Direct Costs) + Overhead Cost. It&apos;s the price floor — the point below
          which the job loses money — not a profit figure. To see how much you&apos;d actually make, look
          at <strong>Est Net Profit</strong> instead, which is Revenue minus that same cost base minus
          Overhead.
        </p>
      </Section>
    </div>
  );
}
