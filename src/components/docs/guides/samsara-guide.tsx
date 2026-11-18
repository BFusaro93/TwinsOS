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

export function SamsaraGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Integrations"
        title="Samsara Integration"
        description="What actually syncs, how vehicles get matched, and where to look when a reading doesn't show up."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#what-it-does">What this integration does</TOCLink>
          <TOCLink href="#setup">Setup, step by step</TOCLink>
          <TOCLink href="#vehicle-matching">How vehicle matching works</TOCLink>
          <TOCLink href="#sync-mechanics">Sync mechanics</TOCLink>
          <TOCLink href="#how-readings-are-written">How a reading turns into a meter update</TOCLink>
          <TOCLink href="#status-and-errors">Sync status and errors</TOCLink>
          <TOCLink href="#meters-and-automations">Meters and automations</TOCLink>
          <TOCLink href="#telematics-tab">The vehicle Telematics tab</TOCLink>
          <TOCLink href="#fault-codes">Fault codes, work orders and automations</TOCLink>
        </div>
      </div>

      <Section id="what-it-does" title="What this integration does">
        <p>
          The Samsara integration pulls one thing from Samsara&apos;s Fleet API: distance data for
          each vehicle. Specifically, it requests two stat types —{" "}
          <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">obdOdometerMeters</code> (the
          vehicle&apos;s OBD-reported odometer) and{" "}
          <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">gpsDistanceMeters</code> (GPS-derived
          cumulative distance, used as a fallback when a vehicle doesn&apos;t report OBD odometer
          data) — and converts whichever value is present into miles.
        </p>
        <p>
          That is what the daily <strong>meter sync</strong> does, and it is the only thing that
          writes to your meters. Separately, each vehicle&apos;s <strong>Telematics</strong> tab reads
          live sensor data from Samsara (fuel, battery, tires, fault codes, location) for display
          and for fault-code work orders — see{" "}
          <GuideLink href="#telematics-tab" className="text-[#60ab45] hover:text-[#4a8a33] dark:hover:text-[#bad3b1] hover:underline">
            The vehicle Telematics tab
          </GuideLink>
          . Engine hours and driver behavior/safety events are not requested.
        </p>
      </Section>

      <Section id="setup" title="Setup, step by step">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            In Samsara, generate a <strong>read-only API token</strong> under Settings → API
            Tokens. No webhook or callback URL needs to be configured on Samsara&apos;s side — this
            integration only ever calls out to Samsara, it never receives anything from Samsara.
          </li>
          <li>
            In Equipt, go to <strong>Settings → Integrations</strong> and paste the token into the{" "}
            <strong>API Key</strong> field, then click <strong>Save</strong>.
          </li>
          <li>
            For each vehicle you want synced, open its detail page and set the{" "}
            <strong>Samsara Vehicle ID</strong> field (under Integrations, in the New/Edit Vehicle
            dialog) — Samsara shows this ID in the URL when you select a vehicle under Fleet →
            Vehicles. This step is optional but strongly recommended; see vehicle matching below
            for what happens if you skip it.
          </li>
          <li>
            Click <strong>Sync Now</strong> on the Integrations tab to run a first sync
            immediately, rather than waiting for the next scheduled run. The button is disabled
            until an API key has been saved.
          </li>
        </ol>
      </Section>

      <Section id="vehicle-matching" title="How vehicle matching works">
        <p>Each vehicle Samsara returns is matched to an Equipt vehicle in two passes:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>By Samsara Vehicle ID first</strong> — if the vehicle&apos;s{" "}
            <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">samsara_vehicle_id</code>{" "}
            field matches the ID on the incoming record, that&apos;s the match.
          </li>
          <li>
            <strong>By exact name second</strong> — if no ID match is found, it falls back to a
            case-insensitive, trimmed comparison of the vehicle&apos;s name against Samsara&apos;s
            vehicle name.
          </li>
        </ol>
        <Callout>
          Setting the Samsara Vehicle ID explicitly is the reliable path. Name matching is a
          convenience fallback — it breaks silently if a vehicle is renamed in either system, or if
          two vehicles share a name.
        </Callout>
        <p>
          A Samsara vehicle with no match in either pass isn&apos;t treated as an error — it&apos;s
          simply skipped, and a line noting the unmatched vehicle name and Samsara ID is added to
          that sync run&apos;s detail log (visible after a manual Sync Now).
        </p>
      </Section>

      <Section id="sync-mechanics" title="Sync mechanics">
        <p>
          Sync is triggered two ways, both hitting the same route (
          <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">
            /api/integrations/samsara/sync
          </code>
          ):
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">How it works</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3] dark:border-border">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Scheduled</td>
              <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">
                A Vercel Cron job hits the route once a day at <strong>10:00 UTC (6:00 AM
                ET)</strong>, authenticated with a cron secret. This run syncs{" "}
                <em>every</em> org that has Samsara enabled with a saved API key — not just one
                org.
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Manual</td>
              <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">
                Clicking <strong>Sync Now</strong> on Settings → Integrations sends an authenticated
                POST as the logged-in user. This requires an <strong>admin</strong> role — the
                route checks the caller&apos;s profile and rejects non-admins — and only syncs the
                caller&apos;s own org.
              </td>
            </tr>
          </tbody>
        </Table>
        <p>
          There is no webhook from Samsara and no near-real-time delivery — every reading you see
          came from one of these two pulls. Samsara&apos;s stats endpoint is paginated; the sync
          follows the pagination cursor until Samsara reports no further pages, so large fleets are
          fully fetched in one run.
        </p>
      </Section>

      <Section id="how-readings-are-written" title="How a reading turns into a meter update">
        <p>For each matched vehicle, the sync looks for meters on that vehicle with a unit of miles or mi:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>No miles meter exists yet</strong> — one is auto-created, named &quot;Odometer,&quot;
            starting at 0, labelled as a Samsara meter and carrying the vehicle&apos;s name. You
            don&apos;t need to create a meter by hand before syncing a vehicle for the first time.
          </li>
          <li>
            <strong>The incoming mileage is less than the meter&apos;s current value</strong> — the
            reading is always saved to the meter&apos;s history. If the meter&apos;s latest reading
            was entered <em>manually</em> (for example a mistyped, too-high odometer), the Samsara
            reading replaces it as the current value, so one bad manual entry can&apos;t block
            syncing. If the latest reading already came from Samsara, odometers don&apos;t go
            backwards, so the lower reading is kept in the history with a note but the current
            value is left alone. Either way the meter&apos;s Last Reading time is refreshed.
          </li>
          <li>
            <strong>The incoming mileage is greater than or equal to the current value</strong> — a
            new row is inserted into <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">meter_readings</code>{" "}
            with <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">source: &quot;samsara&quot;</code> and
            a note of whether the value came from OBD or GPS. The meter&apos;s{" "}
            <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">current_value</code> is only
            advanced when the new mileage is strictly greater than what&apos;s currently stored —
            equal readings are still logged (so you have a daily record even with no vehicle
            movement) but don&apos;t re-trigger the meter update.
          </li>
        </ul>
        <p>
          That current-value update is conditioned on the database row&apos;s value at write time,
          not a value read earlier in the same run — this matters because the cron job and a manual
          Sync Now could in principle overlap, and this guards against one clobbering a higher
          value written by the other.
        </p>
      </Section>

      <Section id="status-and-errors" title="Sync status and errors">
        <p>
          After every run, each org&apos;s <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">integrations</code>{" "}
          row is stamped with a timestamp and a status, both shown on Settings → Integrations:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3] dark:border-border">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Connected (ok)</td>
              <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">No errors this run.</td>
            </tr>
            <tr className="border-b border-[#eceae3] dark:border-border">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Partial</td>
              <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">
                At least one vehicle matched and got a reading, but at least one error also occurred
                (e.g. a meter failed to create, a reading failed to insert).
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">Error</td>
              <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">
                No vehicles matched at all, or the call to Samsara&apos;s API failed outright — most
                commonly an invalid or expired API key, which surfaces here as a failed fetch rather
                than a distinct &quot;bad key&quot; message.
              </td>
            </tr>
          </tbody>
        </Table>
        <p>
          A manual <strong>Sync Now</strong> additionally shows the run&apos;s full detail log
          inline — counts of vehicles fetched from Samsara, matched, and readings written, plus a
          line-by-line list (unmatched vehicles, skipped backwards readings, any insert failures).
          The scheduled daily run doesn&apos;t surface that detail anywhere in the UI — only the
          summary status and last-synced timestamp update.
        </p>
        <Callout>
          <strong>Odometer readings not updating as expected?</strong> Check, in order: 1) the
          integration shows a saved API key and status other than &quot;Error&quot; on Settings →
          Integrations. 2) the vehicle has a <strong>Samsara Vehicle ID</strong> set — if it&apos;s
          relying on name matching, confirm the name is an exact, case-insensitive match to what
          Samsara shows. 3) run <strong>Sync Now</strong> and read the detail log — an unmatched
          vehicle or a skipped &quot;less than current&quot; reading will say so explicitly. 4) the
          vehicle has a meter with unit <strong>miles</strong> or <strong>mi</strong> — a meter in
          a different unit (e.g. hours) is never touched by this sync. 5) confirm the API token in
          Samsara hasn&apos;t been revoked or regenerated since it was pasted in.
        </Callout>
      </Section>

      <Section id="meters-and-automations" title="Meters and automations">
        <p>
          A Samsara-written reading is not a special case for anything downstream — it updates the
          vehicle&apos;s meter through the exact same{" "}
          <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">meter_readings</code> +{" "}
          <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">meters.current_value</code>{" "}
          path a manually logged reading would use, just tagged with{" "}
          <code className="rounded bg-[#f4f6f0] dark:bg-muted/50 px-1 py-0.5 text-xs">source: &quot;samsara&quot;</code>{" "}
          instead of a person&apos;s name. That means any meter-threshold automation configured on
          that meter fires exactly the same way it would from a manual entry — see{" "}
          <GuideLink
            href="/settings/support/meters-guide#building-an-automation"
            className="text-[#60ab45] hover:text-[#4a8a33] dark:hover:text-[#bad3b1] hover:underline"
          >
            Building a meter-threshold automation
          </GuideLink>{" "}
          and{" "}
          <GuideLink
            href="/settings/support/meters-guide#pending-reset"
            className="text-[#60ab45] hover:text-[#4a8a33] dark:hover:text-[#bad3b1] hover:underline"
          >
            Pending Reset, explained
          </GuideLink>{" "}
          in the Meters guide for how that firing, Pending Reset, and Service Interval logic works
          — none of it is re-explained here since it doesn&apos;t change based on where the reading
          came from.
        </p>
      </Section>

      <Section id="telematics-tab" title="The vehicle Telematics tab">
        <p>
          Once an admin has connected Samsara (Settings &gt; Integrations), every vehicle in{" "}
          <strong>Equipt &gt; Vehicles</strong> gets a <strong>Telematics</strong> tab. It does not
          appear while Samsara is not connected. Opening the tab pulls the latest readings from
          Samsara, and the <strong>Refresh</strong> button pulls them again.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Sensor readings:</strong> engine state, battery voltage, tire pressure at each
            corner, fuel level, coolant temperature and DEF level. A reading the vehicle does not
            report shows <em>Not reported</em>, not zero.
          </li>
          <li>
            <strong>Location:</strong> a map with the vehicle&apos;s address, speed and heading.
          </li>
          <li>
            <strong>History:</strong> fuel and battery charts over 7, 30 or 90 days. An hourly job
            records one sample per vehicle per hour, so a chart starts filling from the first hour after
            Samsara is connected.
          </li>
        </ul>
        <p>
          The tab explains why it is empty instead of failing: <em>Samsara isn&apos;t connected</em>{" "}
          (an admin adds the API key under Settings &gt; Integrations), <em>This vehicle isn&apos;t
          linked to Samsara</em> (set its Samsara Vehicle ID on the Details tab, or name it exactly as
          it appears in Samsara, then reopen the tab) or <em>No telematics yet</em> (use Try again).
        </p>
      </Section>

      <Section id="fault-codes" title="Fault codes, work orders and automations">
        <p>
          The <strong>Fault Codes</strong> card lists the vehicle&apos;s current codes, each marked{" "}
          <em>Confirmed</em>, <em>Pending</em> or <em>Permanent</em>. Pending codes are shown for
          information only: they flicker on and off while the engine computer decides whether a fault is
          real, so they never raise work. A confirmed or permanent code can become a work order in two
          ways.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>By hand:</strong> click <strong>Create work order</strong> beside the code (you
            need permission to edit work orders). The work order carries the code, its description and
            the check-engine-light state, and is high priority when the light is on. Once raised, the
            work order number replaces the button and links to it. Clicking again for the same open
            code returns the existing work order instead of making a second one.
          </li>
          <li>
            <strong>Automatically:</strong> in <strong>Equipt &gt; Automations</strong> choose the{" "}
            <strong>Vehicle Fault Code</strong> trigger. It fires once when a connected vehicle reports a
            new confirmed fault code, and can be limited to{" "}
            <em>Only when the check-engine light is on</em>. Its actions (create a work order, a request
            or a notification) include the code and description.
          </li>
        </ul>
        <p>
          The first hourly check after Samsara is connected records the codes a vehicle already has{" "}
          <em>without</em> firing automations, so switching the feature on does not create a burst of
          work orders. Only codes that appear after that fire. When a code stops being reported it is
          cleared; if it comes back later it counts as a new occurrence.
        </p>
      </Section>
    </DocsFontScope>
  );
}
