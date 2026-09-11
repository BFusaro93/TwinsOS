import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const PRICE_LAYERS: [string, string, string][] = [
  [
    "Service catalog rate",
    "CRM → Services → Service Catalog",
    "The default rate on a service. Used to fill in a price when that service is added to a new estimate, invoice or package. Changing it never touches work that already exists.",
  ],
  [
    "Rate matrix tiers",
    "A service's Rate Matrix tab",
    "Tiered pricing by a measured value (e.g. turf square footage). For a matrix-priced service this — not the default rate — is the real catalog price.",
  ],
  [
    "Client job service rate",
    "A job's Services tab",
    "The price this client agreed to for this service on this job. This is what actually gets billed when a visit is completed.",
  ],
  [
    "Package monthly amount",
    "CRM → Packages",
    "The fixed monthly installment for a bundled program. Billed on its own schedule.",
  ],
  [
    "Per-visit rate",
    "A visit's detail sheet",
    "A one-off override for a single visit. Set deliberately, so nothing bulk ever overwrites it.",
  ],
];

export default function ServicesPricingGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Services & Pricing"
        description="The service catalog, bulk catalog price changes, and Price Adjustment runs — which prices seed new work and which ones actually bill."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where">Where it is</TOCLink>
          <TOCLink href="#layers">Where a price actually lives</TOCLink>
          <TOCLink href="#bulk-prices">Bulk Prices — changing the catalog</TOCLink>
          <TOCLink href="#adjustments">Price Adjustments — re-pricing live work</TOCLink>
          <TOCLink href="#undo">Undoing a run</TOCLink>
          <TOCLink href="#permissions">Permissions</TOCLink>
        </div>
      </div>

      <Section id="where" title="Where it is">
        <p>
          <strong>CRM → Services</strong>, titled <strong>Services &amp; Pricing</strong>. It has
          three tabs: <strong>Service Catalog</strong> (your list of services),{" "}
          <strong>Price Adjustments</strong> (re-pricing existing client work), and{" "}
          <strong>Adjustment History</strong> (every run, with an undo).
        </p>
      </Section>

      <Section id="layers" title="Where a price actually lives">
        <p>
          This is the one thing worth understanding before you change any price in bulk. A price
          isn&apos;t stored in a single place — it&apos;s copied down as work is created, so each
          client keeps the price they were actually sold at.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-4 py-2 text-left">Price</th>
              <th className="px-4 py-2 text-left">Where you edit it</th>
              <th className="px-4 py-2 text-left">What it does</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {PRICE_LAYERS.map(([name, where, what]) => (
              <tr key={name} className="border-t border-[#e6e6e0]">
                <td className="px-4 py-2 align-top font-semibold">{name}</td>
                <td className="px-4 py-2 align-top">{where}</td>
                <td className="px-4 py-2 align-top">{what}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Raising the catalog rate does not raise anyone&apos;s bill.</strong> It only changes
          what gets filled in on the <em>next</em> estimate, invoice or package line. To move money on
          work that already exists, use a Price Adjustment run.
        </Callout>
      </Section>

      <Section id="bulk-prices" title="Bulk Prices — changing the catalog">
        <p>
          On the <strong>Service Catalog</strong> tab, <strong>Bulk Prices</strong> opens an editable
          grid of every service currently listed. Type a new rate on any row, or use{" "}
          <strong>Quick Adjust</strong> to move them all at once.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Percent or flat.</strong> Percent takes a whole number (5 for +5%, -3 for -3%);
            flat takes dollars (2.50, or -1).
          </li>
          <li>
            <strong>Round to</strong> — exact cent, nearest $0.25, nearest $1, or nearest $5. Nobody
            quotes $47.83 for a mow.
          </li>
          <li>
            <strong>Rate-matrix tiers</strong> are included by default and shown indented under their
            service, along with the overflow rate. Leave this on for a general increase — a
            matrix-priced service&apos;s real price is in its tiers, so adjusting only the default rate
            column would leave it quoting last year&apos;s numbers.
          </li>
          <li>
            Quick Adjust acts on <strong>whatever matches the search box</strong>, so you can raise
            just mowing without touching everything else.
          </li>
        </ul>
        <p>
          Changed rows are highlighted with their previous value beside them, and the footer counts
          what you&apos;ve modified. Nothing is written until you click <strong>Save Changes</strong>;{" "}
          <strong>Reset</strong> puts every row back.
        </p>
        <Callout>
          A percentage leaves a $0.00 row at $0.00 — scaling nothing gives nothing. Use a flat
          adjustment to put a price on a service that doesn&apos;t have one yet.
        </Callout>
      </Section>

      <Section id="adjustments" title="Price Adjustments — re-pricing live work">
        <p>
          The <strong>Price Adjustments</strong> tab is the tool for an actual price increase: it
          changes what clients get billed going forward. Every run follows the same three steps —
          describe the change, preview it, then apply.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Adjustment</strong> — percent or flat, plus a rounding rule, exactly as in Bulk
            Prices.
          </li>
          <li>
            <strong>Apply to</strong> — any combination of client job service rates, package monthly
            amounts, and package service rates.
          </li>
          <li>
            <strong>Limit to</strong> — optionally narrow by service and by job type (recurring,
            one-time, package, snow, project, waiting list). Leave both empty to cover everything the
            targets above reach.
          </li>
          <li>
            <strong>Preview changes</strong> — a line-by-line before/after for every price that would
            move, with the total change and a count of rows matched but left alone.
          </li>
          <li>
            <strong>Name the run and apply.</strong> A name is required, because that&apos;s what you&apos;ll
            look for later if you need to undo it.
          </li>
        </ol>
        <p>
          Job service rates are shown per client and job (&quot;Ralph Fusaro · Lawn Mowing (Job
          #14)&quot;), so you can scan exactly who is affected before committing. The summary breaks
          the total down per target, because a job service rate is per billing period while a package
          amount is per month — one combined figure would be misleading.
        </p>
        <Callout>
          A run <strong>never</strong> touches signed contracts, invoices that have already been
          issued, or per-visit rate overrides. Contract pricing is deliberately out of scope —
          re-pricing a signed agreement is a conversation, not a bulk operation.
        </Callout>
        <p>
          If you change the form after previewing, the preview disappears and the Apply button goes
          with it — so you can never apply numbers you didn&apos;t actually look at. And if anything
          changed in the background between your preview and your apply (someone added a job, edited
          a rate), the run stops and asks you to preview again rather than quietly affecting a
          different set of rows.
        </p>
      </Section>

      <Section id="undo" title="Undoing a run">
        <p>
          <strong>Adjustment History</strong> lists every run — what it changed, how many lines, the
          total, when, and by how much. The undo arrow restores each line&apos;s original price.
        </p>
        <Callout>
          Undo skips any line you&apos;ve re-priced by hand since the run, and tells you how many it
          left alone. A later deliberate decision is never thrown away by an undo, so a report like
          &quot;12 lines restored, 2 left alone because they were changed since the run&quot; is
          working as intended — those two kept the price you set manually.
        </Callout>
        <p>
          A reverted run stays in the history as a record and can&apos;t be undone twice.
        </p>
      </Section>

      <Section id="permissions" title="Permissions">
        <p>
          Two separate permissions, both off by default for non-admin roles (admins always have
          both), under <strong>Scheduling → Service Access</strong> in Roles:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Bulk Update Catalog Prices</strong> — shows the Bulk Prices button on the Service
            Catalog tab.
          </li>
          <li>
            <strong>Run Price Adjustments</strong> — shows the Price Adjustments and Adjustment
            History tabs. Enforced in the database itself, not just hidden in the UI: applying or
            reverting a run re-checks this permission at the point the prices are written, so a user
            without it cannot re-price anything by any route.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
