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

const REPORT_TYPES: [string, string][] = [
  ["Injury", "Someone was hurt at work. Needs a severity (first aid, medical treatment, lost time, or fatality)."],
  ["Illness", "A work-related illness (e.g. heat illness). Counted the same way as an injury."],
  ["Near miss", "An event that could have hurt someone but didn't. Tracked, but it has no severity, days away, treatment or claim route, and it never counts as an injury."],
];

const INTAKE_FIELDS: [string, string][] = [
  ["What are you reporting?", "Injury, Illness, or Near miss."],
  ["Who and when", "Employee name, job title, supervisor, whether they've told their supervisor, date and time."],
  ["What happened", "Exact location, what they were doing, step-by-step description, equipment/tools, PPE worn, witnesses."],
  ["The injury", "Nature of injury (the list from the paper investigation form), body parts, whether they saw a doctor (name, phone, date), and whether that body part was injured before. For a near miss: how someone could have been hurt."],
  ["Prevention", "What could have been done to prevent it."],
];

const OFFICE_FIELDS: [string, string][] = [
  ["Severity", "First aid, Medical treatment (a doctor visit), Lost time, or Fatality. Field submissions default to First aid until the office sets it."],
  ["Days away from work", "Whole days. Feeds the Days Away stats."],
  ["Treatment given", "Free text."],
  ["Cost handled through", "Workers' comp, Self-pay (company), or Not decided yet. See Expenses below."],
  ["OSHA recordable", "A checkbox the office sets; counted on the Reporting tab."],
  ["Cause / Corrective action", "The outcome of the supervisor's investigation."],
];

const STATUS_ROWS: [string, string][] = [
  ["Open", "Default for every new report."],
  ["In Progress", "Being investigated or followed up."],
  ["Resolved / Closed", "Finished. Editing the details, adding or deleting expenses, and deleting the case are blocked until it's reopened. Status and resolution notes always stay editable."],
];

export function InjuryCasesGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Injury & Near-Miss Cases"
        description="Reporting injuries, illnesses and near misses from the field, following them up in the office, tracking self-paid costs, and feeding the Accident Free Workdays KPI."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">What it is, and where to find it</TOCLink>
          <TOCLink href="#reporting">Filing a report from the field</TOCLink>
          <TOCLink href="#office">What the office adds</TOCLink>
          <TOCLink href="#dashboard">The dashboard and list</TOCLink>
          <TOCLink href="#expenses">Expenses and self-pay</TOCLink>
          <TOCLink href="#alerts">Supervisor alerts</TOCLink>
          <TOCLink href="#reporting-tab">The Reporting tab</TOCLink>
          <TOCLink href="#kpi">Accident Free Workdays (KPI)</TOCLink>
          <TOCLink href="#paper">Working alongside the paper form</TOCLink>
          <TOCLink href="#privacy">Who can see it</TOCLink>
        </div>
      </div>

      <Section id="overview" title="What it is, and where to find it">
        <p>
          An <strong>Injury Case</strong> is a record of one reported injury, illness or near miss.
          It works like <GuideLink href="/settings/support/damage-cases-guide" className="text-[#60ab45] underline">Damage Cases</GuideLink>:
          a list with a dashboard on top, a detail panel per case, expenses, files, comments and an
          audit trail.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Office:</strong> Tools → <strong>Injury Cases</strong> (<code>/tools/injury-cases</code>).
            This page is hidden from crew accounts.
          </li>
          <li>
            <strong>Field:</strong> Job Photos → Field → <strong>Injury / Near Miss</strong> — a
            phone-friendly report form anyone with Job Photos access can fill out. Submitting it
            opens a new case.
          </li>
        </ul>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Report type</th>
              <th className="px-3 py-2">What it means</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {REPORT_TYPES.map(([t, d]) => (
              <tr key={t} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{t}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{d}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Report near misses too.</strong> They show where someone almost got hurt, so the
          hazard can be fixed first. A rise in near misses is usually a sign people are reporting,
          not that the job got less safe — which is why they never reset the days-since-last-injury
          counter.
        </Callout>
      </Section>

      <Section id="reporting" title="Filing a report from the field">
        <p>
          The field form follows the first page of the paper <em>Employee&apos;s Report of Injury</em>.
          It&apos;s meant to be filled out as soon as possible after the incident — the paper process
          asks for it within 48 hours.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2">What it asks</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {INTAKE_FIELDS.map(([s, d]) => (
              <tr key={s} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{s}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{d}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Only the employee name and a description are required. Start typing the <strong>Supervisor</strong>{" "}
          field to pick from your employee list — an exact employee name is what lets the{" "}
          <a href="#alerts" className="text-[#60ab45] hover:underline">supervisor alert</a> find that
          person&apos;s login. The same Job Photos → Field menu also has a <strong>Damage Report</strong>{" "}
          form that opens a Damage Case.
        </p>
      </Section>

      <Section id="office" title="What the office adds">
        <p>
          Opening or editing a case from the Injury Cases page shows the same form plus an{" "}
          <strong>Office use</strong> section — the things a field report shouldn&apos;t have to guess:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Notes</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {OFFICE_FIELDS.map(([f, d]) => (
              <tr key={f} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{f}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{d}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATUS_ROWS.map(([s, d]) => (
              <tr key={s} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{s}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{d}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Change status from the badge in the case header. Marking a case <em>Resolved</em> prompts
          for resolution notes. Case numbers look like <code>IC-2026-001</code>.
        </p>
      </Section>

      <Section id="dashboard" title="The dashboard and list">
        <p>The top of the Injury Cases page shows:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Days Since Last Injury</strong> — calendar days since the most recent injury or illness. Near misses don&apos;t count.</li>
          <li><strong>Open</strong> and <strong>Closed</strong> — Open includes In Progress; Closed includes Resolved.</li>
          <li><strong>Injuries YTD</strong> (with how many were recordable), <strong>Days Away YTD</strong>, and <strong>Near Misses YTD</strong>.</li>
        </ul>
        <p>
          The list below can be searched (employee, case #, description) and filtered by type and
          status, and shows type, severity, how the cost is handled, total cost and days away.
        </p>
      </Section>

      <Section id="expenses" title="Expenses and self-pay">
        <p>
          Use the <strong>Expenses</strong> tab for costs the company pays directly — typically when
          you choose <em>Self-pay (company)</em> instead of filing a workers&apos; comp claim. Each
          expense has a date, a type (<em>Medical</em>, <em>Lost wages</em> or <em>Other</em>), an
          optional provider (a vendor from your shared Vendors list, or a typed clinic name), a
          description and an amount. The case&apos;s <strong>Total Cost</strong> is the sum of its
          expenses, and shows in the list and on the Reporting tab.
        </p>
        <Callout>
          <strong>Cost handled through</strong> is a label, not a calculation: choosing Workers&apos; comp
          doesn&apos;t stop you logging expenses, it just records how the case is being handled. A
          self-pay case opens on the Expenses tab.
        </Callout>
        <p>
          Every change to a case — status, details, expenses added, edited or removed — is recorded
          in the case&apos;s <strong>Audit Trail</strong> tab, alongside the <strong>Files</strong> and{" "}
          <strong>Comments</strong> tabs shared with other records.
        </p>
      </Section>

      <Section id="alerts" title="Supervisor alerts">
        <p>
          When a report is filed, Landscapt notifies the people who need to follow up — in the
          notification bell, by email, and as a push to anyone using the crew app. The alert links
          straight to the case.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>The named supervisor</strong> is always alerted, if the name on the report matches
            an employee who has a login.
          </li>
          <li>
            <strong>The recipient list</strong> is alerted too. Admins set it in Settings →
            Notifications → <em>Injury &amp; Near-Miss Report Recipients</em>; it defaults to all admins
            and managers. Pick specific people to narrow it.
          </li>
          <li>The person who filed the report is never alerted about their own report.</li>
          <li>
            Anyone can turn the alert off for themselves under Settings → Notifications → <em>Injury /
            Near Miss Reported</em>, for in-app and email separately.
          </li>
        </ul>
        <p>
          The email and notification say who, what type, when and where — the details stay behind
          sign-in. See the{" "}
          <GuideLink href="/settings/support/notification-preferences-guide" className="text-[#60ab45] underline">
            Notification Preferences guide
          </GuideLink>{" "}
          for how recipient lists and personal toggles stack.
        </p>
      </Section>

      <Section id="reporting-tab" title="The Reporting tab">
        <p>
          The <strong>Reporting</strong> tab summarises a year at a time (pick the year at the top):
          injuries, illnesses and near misses, recordables, days away, total company-paid cost, and
          how much of it is on self-pay cases. The chart shows each month as stacked incident counts,
          or switch it to cost.
        </p>
      </Section>

      <Section id="kpi" title="Accident Free Workdays (KPI)">
        <p>
          On the Landscapt KPI scorecard, <strong>Accident Free Workdays</strong> is calculated from
          Injury Cases: the Monday–Friday workdays since the most recent injury or illness incident
          date, as of today. It shows a dash until there&apos;s an injury on record. Near misses don&apos;t
          reset it, and deleted cases are ignored. It&apos;s a point-in-time number, not a year total.
        </p>
      </Section>

      <Section id="paper" title="Working alongside the paper form">
        <p>
          The in-app report is the quick intake, not a replacement for the supervisor&apos;s full
          investigation. Keep using your paper <em>Supervisor&apos;s Accident Investigation</em> / <em>Incident
          Investigation Report</em> for the detail that doesn&apos;t belong here (date of birth, address,
          unsafe acts and conditions checklists, investigation team, signatures), and attach the
          finished PDF to the case&apos;s <strong>Files</strong> tab. Record the outcome in the case&apos;s
          Cause and Corrective action fields so it&apos;s searchable and counted.
        </p>
      </Section>

      <Section id="privacy" title="Who can see it">
        <p>
          Injury records are sensitive, so they&apos;re limited to your organization&apos;s own users — client
          portal logins can never read them — and the Injury Cases page is hidden from crew accounts.
          Crew can still <em>file</em> a report from Job Photos → Field. Subscriptions that have
          lapsed to read-only can view cases but not add or change them.
        </p>
      </Section>
    </DocsFontScope>
  );
}
