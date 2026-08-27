import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

export default function WaitingListGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="The Waiting List"
        description="Jobs with a date range instead of a date, held for opportunistic scheduling — and how to actually get them dispatched."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#what-it-is">What the Waiting List is</TOCLink>
          <TOCLink href="#how-jobs-land-here">How a job lands here</TOCLink>
          <TOCLink href="#filtering">Filtering and columns</TOCLink>
          <TOCLink href="#dispatching">Dispatching</TOCLink>
          <TOCLink href="#day-in-the-life">A day in the life</TOCLink>
          <TOCLink href="#location-matching">Location matching, and its limits</TOCLink>
          <TOCLink href="#see-also">See also</TOCLink>
        </div>
      </div>

      <Section id="what-it-is" title="What the Waiting List is">
        <p>
          <strong>Landscapt → Scheduling → Waiting List</strong> holds jobs that don&apos;t have a
          firm date yet — only a date range, like &quot;From May 1&quot; or &quot;May 1 – May 15.&quot;
          Two job types end up here: jobs created with type <strong>Waiting List</strong>, and{" "}
          <strong>Package</strong> jobs whose next visit hasn&apos;t been given a real date yet (more
          on that below).
        </p>
        <p>
          It exists for the case where you know a client needs service sometime in a window, but
          don&apos;t want to commit a crew to a specific day until you have a reason to — usually
          because a crew has an opening nearby and it makes sense to fill it opportunistically rather
          than run an extra trip later.
        </p>
      </Section>

      <Section id="how-jobs-land-here" title="How a job lands here">
        <p>
          A job qualifies for the Waiting List page if its <code>job_type</code> is{" "}
          <code>waiting_list</code> or <code>package</code>, it isn&apos;t soft-deleted, and its date
          window overlaps whatever range you&apos;ve got selected (jobs with no date set at all are
          always included, on either type). Two things keep the list honest as jobs move through
          dispatch:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            A <strong>Waiting List</strong>-type job drops off the page the moment it has an active
            (non-deleted) visit — once it&apos;s dispatched, it&apos;s not waiting anymore, so it
            won&apos;t double up between here and the Dispatch Board.
          </li>
          <li>
            A <strong>Package</strong> job&apos;s services are often bulk-generated for the whole
            season up front — one placeholder visit per service, sitting in a plain{" "}
            <code>scheduled</code> status, sometimes with a crew already pre-assigned. That
            placeholder state doesn&apos;t count as &quot;handled&quot; — only a visit that has moved
            past it (actually dispatched, worked, or resolved) gets filtered out. So a package can
            keep resurfacing on this page, one service at a time, all season.
          </li>
        </ul>
      </Section>

      <Section id="filtering" title="Filtering and columns">
        <p>
          The <strong>Date Window</strong> bar at the top (defaults to today through 30 days out)
          is the primary filter — it&apos;s a server-side query, not a client-side narrow, so it
          also controls which jobs get fetched in the first place. Below that, <strong>Select a
          Filter</strong> lets you narrow the fetched set by one field at a time: Client, Service,
          City, Zip, or Crew. A separate free-text Search box matches client name or service name
          independent of that filter.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Column</th>
              <th className="px-3 py-2">Shows</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {[
              ["Client", "Client name (linked to the client record) and service address, if set."],
              ["Service", "Service name(s) on the job, or the individual service for a package visit row."],
              ["Date Range", "The job's (or, for a package, that visit's) window — \"From X,\" \"X – Y,\" or \"Any time\" if unset."],
              ["City / Zip", "Service address city and zip — also the two fields usable for location filtering."],
              ["Crew", "Pre-assigned crew, if any, or \"Unassigned.\""],
              ["Rate", "The job's flat rate, or the service's own rate for a package visit row."],
            ].map(([col, desc]) => (
              <tr key={col} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{col}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A package job with more than one active service — or any waiting-list job carrying more
          than one service — is expanded into one row per service rather than one row for the whole
          job. That&apos;s what lets you dispatch &quot;Mulch&quot; to one crew this week and hold
          &quot;Spring Clean-up&quot; for another opening, instead of both going out together on
          whatever date you pick.
        </p>
      </Section>

      <Section id="dispatching" title="Dispatching">
        <p>
          Every row has its own <strong>Schedule</strong> button, and the dark actions bar has an{" "}
          <strong>Actions → Dispatch Selected…</strong> option for whatever you&apos;ve checked. Both
          open the same dialog — pick a <strong>Date</strong> and, optionally, a <strong>Crew</strong>,
          then confirm. Dispatching:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Creates a real visit for the job (or, for a package row, for that specific service).</li>
          <li>
            Assigns the crew you picked, or leaves it unassigned if you skip that field — either way
            the job now has a firm date and behaves like any other scheduled visit on the Dispatch
            Board.
          </li>
          <li>
            Removes it from this page on the next refresh — a waiting-list job because it now has an
            active visit, a package service because its visit has moved past the placeholder state.
          </li>
        </ul>
        <Callout>
          Dispatching multiple selected rows at once applies the <em>same</em> date and crew to all
          of them — it&apos;s meant for a batch of jobs you&apos;re sending out together, not for
          picking different dates per job in one action. Use the per-row Schedule button when jobs
          need different treatment.
        </Callout>
      </Section>

      <Section id="day-in-the-life" title="A day in the life">
        <p>
          A crew wraps up a job in the 44057 zip code an hour ahead of schedule. Rather than send
          them back to the shop, the dispatcher opens the Waiting List:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Clicks the <strong>Zip</strong> filter under &quot;Select a Filter&quot; and types
            <code> 44057</code>. Three jobs come back — a one-time mulch job, a waiting-list mowing
            job, and one service off a fertilizer package.
          </li>
          <li>
            Checks each row&apos;s <strong>Date Range</strong> and <strong>Rate</strong> columns. The
            mulch job&apos;s window doesn&apos;t open until next week — too early. The package
            service and the mowing job are both eligible today; the mowing job pays more for less
            time on site.
          </li>
          <li>
            Clicks <strong>Schedule</strong> on the mowing job&apos;s row, sets the date to today,
            assigns the crew that&apos;s already in the area, and confirms.
          </li>
          <li>
            The job now has a real visit and shows up on today&apos;s Dispatch Board like any other
            stop — the crew heads there next instead of driving back empty.
          </li>
        </ol>
      </Section>

      <Section id="location-matching" title="Location matching, and its limits">
        <p>
          On this page, &quot;find something nearby&quot; means filtering by <strong>City</strong> or{" "}
          <strong>Zip</strong> — there&apos;s no map or live proximity check built into the list
          itself, just text matching against those two fields. It&apos;s fast and it works, but only
          as well as the address data behind it.
        </p>
        <Callout>
          <strong>Practical tip.</strong> Filtering only works if a job&apos;s service address —
          City and Zip specifically — is filled in and accurate. A client record with a blank or
          stale service address won&apos;t surface when a dispatcher filters by zip, even if it&apos;s
          genuinely around the corner from today&apos;s route. Keep property addresses complete when
          a job is created rather than relying on the client&apos;s billing address as a stand-in.
        </Callout>
        <p>
          The Dispatch Board has a separate, more literal proximity tool — a{" "}
          <strong>Nearby Waiting List</strong> button that geocodes today&apos;s scheduled visits and
          every waiting-list job, then returns matches within a set radius (3 miles by default) using
          actual distance, not just matching text fields. It&apos;s a different feature living on a
          different page — see the Dispatch Board guide below — but it&apos;s the closer equivalent
          to true geofencing if City/Zip filtering here isn&apos;t narrowing things down enough.
        </p>
      </Section>

      <Section id="see-also" title="See also">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Estimating guide</strong> — converting an estimate to a job can set its Job Type
            to Waiting List directly, skipping a separate step to move it here.
          </li>
          <li>
            <strong>Dispatch Board guide</strong> — once a waiting-list job or package visit is
            dispatched from this page, it behaves like any other scheduled visit there, including the
            radius-based Nearby Waiting List lookup described above.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
