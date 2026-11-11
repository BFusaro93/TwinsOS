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

const STAFF_ROLES: [string, string][] = [
  ["Admin", "Full access to everything — all modules, all records, settings, approval flows, and user management."],
  ["Manager", "Full operational access across purchasing and maintenance — everything except organization settings and user management."],
  ["Purchaser", "Manages the full procurement lifecycle from requisition to receiving. Read-only on work orders. Can submit maintenance requests and edit or delete their own while they're still Open, but can't review or convert requests."],
  ["Staff", "Standard Equipt access — creates and manages work orders (not limited to ones assigned to them), and can initiate procurement for parts."],
  ["Viewer", "Read-only in Equipt. No create, edit, delete, or approve access there. Landscapt access follows their Landscapt role."],
  ["Requestor", "Submits maintenance requests and draft purchase requisitions only. Can edit or delete their own maintenance request (title, description, priority, asset/vehicle) only while it's still Open — once it's being reviewed it's locked. Can't approve, review or convert anything, and has no access to assets, vendors, or inventory."],
  ["Crew", "A shared login for a field crew team (e.g. MAINT1, ENHANCE1), not an individual person — confined to the crew field surface, not the full dashboard."],
];

const MATRIX_ROWS: [string, string, string, string, string, string, string][] = [
  ["Admin",      "Yes", "Yes", "Yes", "Full", "Full (bypasses CRM role permissions entirely)", "Automatic"],
  ["Manager",    "No",  "Yes (within limit)", "No", "Full", "None by default — needs a CRM role assigned separately", "N/A"],
  ["Purchaser",  "No",  "No", "No", "Requisitions/POs/receiving/vendors full; work orders read-only", "None by default", "N/A"],
  ["Staff",      "No",  "No", "No", "Work orders, PM, parts, meters full; can create requisitions/POs for parts", "None by default", "N/A"],
  ["Viewer",     "No",  "No", "No", "Read-only", "None by default", "N/A"],
  ["Requestor",  "No",  "No", "No", "Maintenance requests (own, editable while Open) + draft requisitions only", "None by default", "N/A"],
  ["Crew",       "No",  "No", "No", "None — confined to crew field surface", "None — crew app only", "N/A"],
];

export function UsersRolesGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Administration"
        title="Users, Roles & Permissions"
        description="How access works across Equipt, Landscapt, crew logins, and the client portal — and why they aren't all the same system."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#two-systems">Two separate role systems</TOCLink>
          <TOCLink href="#staff-roles">The seven organization roles</TOCLink>
          <TOCLink href="#matrix">Role permission matrix</TOCLink>
          <TOCLink href="#crm-roles">Landscapt/CRM custom roles</TOCLink>
          <TOCLink href="#inviting">Inviting a new user</TOCLink>
          <TOCLink href="#worked-example">Worked example: inviting a Staff member</TOCLink>
          <TOCLink href="#crew-portal">Crew accounts and the client portal</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
          <TOCLink href="#good-to-know">Good to know</TOCLink>
        </div>
      </div>

      <Section id="two-systems" title="Two separate role systems">
        <p>
          Equipt/PO and Landscapt/CRM access are controlled by two independent mechanisms, not one
          unified role model:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>The organization role</strong> — one role on every user&apos;s login: Admin,
            Manager, Purchaser, Staff, Viewer, Requestor, or Crew. This is the role you pick when
            inviting someone from Settings → Users, and it&apos;s what controls Equipt (CMMS) and
            purchasing access.
          </li>
          <li>
            <strong>CRM custom roles</strong> — a completely separate, org-defined permission system
            for Landscapt, managed at Settings → Landscapt Settings → Roles. Each role is a named
            set of on/off switches (over a hundred of them — client access, scheduling, accounting,
            reports, and more), closer to Service Autopilot&apos;s permission model than to the
            seven fixed organization roles.
          </li>
        </ul>
        <Callout>
          <strong>These don&apos;t sync.</strong> Being a Manager or Staff (organization role)
          gives you access to Equipt/PO. It gives you <em>no</em> access to Landscapt/CRM on its own
          — Landscapt access requires the login to be linked to an employee record that has a
          Landscapt role.
          Only Admin is an exception: Admins bypass CRM permission checks entirely and get full CRM
          access automatically.
        </Callout>
      </Section>

      <Section id="staff-roles" title="The seven organization roles">
        <p>These are the only organization roles there are. Every staff login has exactly one.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">What it means</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STAFF_ROLES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] dark:border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Purchaser, Staff, and Requestor only appear if your plan includes Equipt.</strong>{" "}
          A Landscapt-only org has no purchase orders, work orders, or assets for those roles to act
          on, so the invite and role dropdowns hide them until Equipt is on the plan.
        </Callout>
        <Callout>
          <strong>The role descriptions in Settings → Users → Roles also adapt to your plan.</strong>{" "}
          Admin, Manager, Viewer, and Crew exist regardless of which module(s) you have, but the
          permission bullets under each one are filtered to what your org&apos;s plan actually includes —
          a Landscapt-only org won&apos;t see work-order or purchase-order bullets under Admin/Manager,
          and an Equipt-only org won&apos;t see client/estimate/dispatch bullets. Nothing about the
          underlying role or its real access changes — this only cleans up what&apos;s displayed.
        </Callout>
      </Section>

      <Section id="matrix" title="Role permission matrix">
        <p>A snapshot of what each organization role can do, drawn from the role descriptions shown in Settings → Users → Roles.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Manage users</th>
              <th className="px-3 py-2">Approve req./POs</th>
              <th className="px-3 py-2">Edit org settings</th>
              <th className="px-3 py-2">Equipt/PO access</th>
              <th className="px-3 py-2">Landscapt/CRM access</th>
              <th className="px-3 py-2">Client portal access</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {MATRIX_ROWS.map((row) => (
              <tr key={row[0]} className="border-b border-[#eceae3] dark:border-border last:border-0">
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={
                      i === 0
                        ? "whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100"
                        : "px-3 py-2 text-[#4a4a46] dark:text-neutral-300"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="text-xs text-[#7a7a74] dark:text-neutral-400">
          &quot;None by default&quot; for CRM access means the organization role alone doesn&apos;t
          grant it — an admin has to link the user to an employee record with a Landscapt role
          under Team → Employees. Client portal accounts are a different login entirely — see{" "}
          <GuideLink href="/settings/support/client-portal-guide" className="text-[#60ab45] hover:underline">
            the Client Portal guide
          </GuideLink>.
        </p>
      </Section>

      <Section id="crm-roles" title="Landscapt/CRM custom roles">
        <p>
          Landscapt access is governed by Landscapt roles — roles you build yourself at Settings →
          Landscapt Settings → Roles, not the seven fixed organization roles above. Each role is a
          list of permissions (Add Client, Add/Modify Invoices, Dispatch Board, and well over a
          hundred others across Home, CRM, Scheduling, Accounting, and Mobile) that you switch on
          or off per role.
        </p>
        <p>
          To give someone CRM access, two things have to both be true:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            They have an employee record (Team → Employees) linked to their login. On the employee
            record, pick the login from the <strong>Select a user to link…</strong> dropdown — it
            lists active users who aren&apos;t already linked to another employee, and once linked
            it shows their name and email.
          </li>
          <li>That employee record has an active <strong>Landscapt Role</strong> — the role that defines what they can see and do inside Landscapt.</li>
        </ol>
        <p>
          Without both, a user with a perfectly valid organization role (say, Manager) is blocked
          from Landscapt entirely — Landscapt checks for a Landscapt role on their employee record,
          not their organization role. The Landscapt tile on their Home screen
          reflects this too: it only appears once both conditions above are met, so an unlinked
          user simply doesn&apos;t see a tile that would otherwise dead-end in a &quot;not
          linked&quot; screen.
        </p>
        <p>
          <strong>Money actions are checked inside the database, per permission.</strong> Having
          CRM access is not enough to move money: refunding or voiding a payment needs the
          refund/void or delete-payment permission, recording or editing a payment or credit needs
          Add/Modify Payments or Credits, applying money or credit to an invoice needs the payment
          or credit permission, and merging invoices, invoicing a project milestone and reconciling
          an invoice&apos;s payments need Add/Modify Invoices (reconcile accepts the payment
          permissions too). The system checks the same permissions the buttons use, so a role
          without them is refused even if it tries the action another way.
        </p>
        <p>
          <strong>Cancelling jobs and bulk-editing clients are enforced the same way.</strong>{" "}
          Setting a job to Cancelled needs the Cancel Job permission, and changing a field
          (account type, source, priority, email opt-in, do-not-market, or status to Inactive)
          on more than one client at a time needs Bulk Edit. Editing one client at a time only
          needs the normal client edit permission. A role without the permission sees a
          &quot;You do not have permission&quot; error rather than a silent failure.
        </p>
        <p>
          <strong>Creating and changing records is checked inside the database too.</strong>{" "}
          These permissions are enforced on every save, not just by hiding buttons:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Invoices and invoice lines</strong> need Add/Modify Invoices. Without it, a
            role can still print or QuickBooks-sync an invoice it can see (which locks it and
            moves a draft to Printed), but not unlock it or change it. Marking an invoice Sent, or
            emailing it, needs Email Invoices. Generate Snow Invoices and Create Invoices from
            Contracts let a role create the draft invoices those screens generate. Completing a
            visit, or a one-time job, still creates its automatic invoice for anyone allowed to
            complete it. Once a job has been invoiced, changing its service rates, quantities or
            taxable flag needs Add/Modify Invoices.
          </li>
          <li>
            <strong>Job materials on an invoice</strong>: anyone who can work a job&apos;s
            Products list can take a material off its invoice (Remove from Invoice, Used — do not
            Invoice, Not Used) while that invoice is still an unlocked draft; the invoice line and
            totals update with it. Once the invoice has been printed or sent, that needs
            Add/Modify Invoices, and a locked invoice must be unlocked first.
          </li>
          <li>
            <strong>Estimates</strong> (and their line items, sub-items, equipment, direct
            costs, photos and payment-plan milestones) need Add Estimate to create and Edit
            Estimate to change or delete. Add Estimate alone also covers finishing a new estimate
            you created that hasn&apos;t been sent. Send Estimate alone can mark an estimate sent
            (and nothing else), and Add Job alone can mark an open estimate accepted when
            converting it to a job.
          </li>
          <li>
            <strong>Project billing milestones</strong> need Add/Modify Projects or Add/Modify
            Invoices. Once an estimate is converted to a project, its milestones belong to the
            project: they show as read-only on the estimate for a role that can edit estimates but
            not projects. Converting the estimate (Add Job) carries them onto the project.
            Invoicing a milestone, or changing whether it is invoiced, needs Add/Modify Invoices
            on either screen.
          </li>
          <li>
            <strong>Contracts</strong> (and their notes) need Add, Edit or Delete Contract for
            each action; Create Invoices from Contracts may only record the billing dates it
            stamps.
          </li>
          <li>
            <strong>New jobs</strong> need Add Job (a project also allows Add/Modify Projects).
          </li>
          <li>
            <strong>Tickets</strong> need View/Modify Tickets to edit, close, reassign, delete or restore.
            A crew login can still edit a ticket it created itself (for example a field upsell suggestion).
          </li>
          <li>
            <strong>Campaigns</strong> need Add Campaign to be created, Send/Launch Campaign to be
            scheduled or sent (including Mark Scheduled), Edit Campaign for other changes and Delete
            Campaign to delete.
          </li>
          <li>
            <strong>Services</strong> need Add, Edit or Delete Service (or the Scheduling settings
            permission). <strong>Settings → Accounting</strong> needs the Accounting settings permission (or CRM
            settings). Company settings also covers the tax rate, ACH and card fee, but not invoice or
            estimate numbering.
          </li>
          <li>
            <strong>Automations</strong> need Create/Modify Automation; Stop Automation alone
            can only switch one on or off. <strong>Document templates</strong> and{" "}
            <strong>packages</strong> need their Add, Edit or Delete permission.{" "}
            <strong>Teams</strong> need Teams; the Dispatch Board permission can still add an
            employee to a crew&apos;s roster and set a crew&apos;s default equipment.
          </li>
          <li>
            <strong>Schedules</strong> (the recurring-schedule templates) need the Scheduling settings
            permission to edit, rename, switch off, delete or reschedule; without it the Schedules page
            and sidebar item are hidden. Add Job can still create a new schedule from a job&apos;s
            Recurring Schedule picker.
          </li>
        </ul>
        <p>
          Editing an existing job, its visits and crew time stays open to every CRM role in the
          database, since the crew app writes those. Rescheduling, re-crewing, completing and bulk-updating
          visits from the office, generating visits and changing a job&apos;s materials need one of the
          scheduling permissions: Dispatch Board, Waiting List, Manage Snow Dispatch, View Jobs or Add Job. Giving an invoice its number (which happens when it is
          printed, emailed or saved) is open to anyone who can see the invoice.
        </p>
        <p>
          <strong>Client notes, stored card and balance are protected on write.</strong> Changing
          a client&apos;s Office Notes needs View Notes. Changing the stored payment method, or
          turning autopay on, needs View Credit Card #&apos;s plus Add/Modify Payments. Changing
          a balance directly needs View Balance plus Add/Modify Credits (balances recalculated
          from invoices and payments are unaffected). Turning autopay off is always allowed.{" "}
          <strong>Still hide-only:</strong> View Notes, View Credit Card #&apos;s, View Balance,
          View Billing and Export Lists control what the screen shows and offers, but they
          don&apos;t withhold the data itself from that login, and an export contains whatever
          the screen has already loaded.
        </p>
        <Callout>
          <strong>Admins skip all of this.</strong> If someone&apos;s organization role is Admin,
          every Landscapt permission check passes automatically — an Admin never needs a linked
          employee record or a Landscapt role.
        </Callout>
        <p>
          <strong>Report permissions</strong> live on the role editor&apos;s Reports tab and work
          in two layers, both checked by the system itself, not just by hiding buttons:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>View Report Center</strong> (Home &gt; Report Access) is the front door. It is
            required to open the Report Center and to run or save a custom analysis, open a saved report, view a Custom Dashboard, or use the
            Graphics Library. <strong>Manage Report Center</strong> additionally allows building
            those and editing the KPI Scorecard, and is also what lets someone create or change
            dashboards, custom reports and scheduled report emails. The database itself refuses
            those writes without it, so a view-only role can&apos;t do them any other way.
          </li>
          <li>
            <strong>View &amp; Edit Payroll Report</strong> (Home &gt; Report Access) unlocks the
            Payroll tab in the Report Center, where each person&apos;s Start Day / End Day hours are
            reviewed, corrected and exported. Admins always have it; the default Owner, Operations
            Manager and Office Admin roles have it. An organization role of Manager alone does
            not grant it.
          </li>
          <li>
            <strong>Individual report permissions</strong> under CRM Reports, Scheduling Reports, and
            Accounting Reports each unlock one pre-built report by name (Client Balance, Job Cost
            Summary, A/R Aging Report, …). The same permissions also control the datasets behind custom
            analyses and dashboard panels, so a role that can&apos;t see a payroll or accounting
            report can&apos;t rebuild it ad hoc either: <strong>Employees</strong> needs Employee
            Directory; <strong>Timesheets</strong> needs Job Hours Summary or Employee Directory;{" "}
            <strong>Crew Drive Time</strong> needs Job Hours Summary; <strong>Job Visits</strong>{" "}
            and <strong>Job Services</strong> need Job Costing, Job Cost Summary, Cost of Goods Sold
            Report, or Job Hours Summary; <strong>Projects — WIP Schedule</strong> needs Job
            Costing or Job Cost Summary; <strong>Invoices</strong> and{" "}
            <strong>Invoice Line Items</strong> need Invoiced Income by Client, Invoices with
            Balances, or A/R Aging Report; <strong>Contracts</strong> needs Client Contracts,
            Package Summary Report, or one of those three; <strong>Payments</strong> needs
            Payment Audit Summary or one of those three; <strong>Estimates</strong> and{" "}
            <strong>Estimate Line Items</strong> need View Estimates, Estimates by Stage, or Won
            Estimates by Service; <strong>Audit Log</strong> needs Audit Log or Security &amp;
            Access Audit. A dashboard panel the user can&apos;t query shows &quot;You
            don&apos;t have permission to view this panel&quot; rather than failing the whole
            dashboard.
          </li>
          <li>
            <strong>Dashboard Access</strong> (Home &gt; Dashboard Access in the role editor) has
            one View permission per built-in dashboard — Equipt Dashboard, My Day, Reports Dashboard, KPI
            Scorecard, Driver Safety Scores, Company Report, Social Media, Custom Dashboards, Job
            Costing, Estimate Builder, and Calculators. A role without one doesn&apos;t see that
            dashboard in the Dashboards sidebar or overview, and opening its web address directly is
            blocked. Admins always see everything. A login with no Landscapt role sees none of these
            dashboards, with one exception: Equipt-only staff (a shop mechanic, say) still get the
            Equipt Dashboard and Driver Safety Scores based on their organization role.
          </li>
        </ul>
      </Section>

      <Section id="inviting" title="Inviting a new user">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Go to <strong>Settings → Users</strong>. Only Admins see the Invite User and Create Crew Account buttons.</li>
          <li>Click <strong>Invite User</strong>, enter their name, email, and pick one of the organization roles.</li>
          <li>
            For anyone who isn&apos;t an Admin or Crew, optionally pick a <strong>Landscapt role</strong>. Landscapt
            access comes from a Landscapt role on an employee record, not from the login role, so choosing one
            adds them to your employee list and links the two for you. Leave it blank and they can sign in but
            see a &quot;No Landscapt access yet&quot; screen until an admin links them under Team → Employees.
            The invite email names your company.
          </li>
          <li>
            They receive an email invitation and set their own password on first login. If the email
            is already registered elsewhere in the system, a password-reset link is sent instead so
            they land on the same set-password screen. If the email belongs to a different type of
            account, such as a client portal login, or to a user in another organization, the invite
            is refused with a message; use a different email. Inviting someone who is already an active
            member of your team is refused too (&quot;already an active member&quot;) — change their role in
            the table instead. If the invitee&apos;s employee record already has a different Landscapt role,
            that role is kept and the invite says so; change it under Team → Employees.
          </li>
          <li>
            Invite links are single-use and expire for security. If a link no longer works, an Admin can
            resend the invite. Opening an invite link again after the account is set up says
            &quot;You&apos;re already set up&quot; with a link to sign in.
          </li>
          <li>
            An Admin can resend a pending invite, change a user&apos;s role, or deactivate them at
            any time from the same table. Deactivating revokes their login outright — it&apos;s not
            just a status label, it bans their account the same moment, so they can&apos;t sign in
            again, and a session that&apos;s already open loses access to your organization&apos;s
            data immediately rather than lingering until it expires. A deactivated user shows an{" "}
            <strong>Inactive</strong> badge and a reactivate icon in place of the trash icon;
            clicking it restores their login immediately, with their role and any CRM employee link
            untouched. A deactivated user can&apos;t be re-invited (use Reactivate instead), and a
            deactivated admin can&apos;t use the invite, reset-password or deactivate actions. The last
            active Admin can&apos;t be deactivated or changed to another role — the role change or
            deactivation is refused with &quot;This is the last active admin — promote another admin
            first&quot;.
          </li>
          <li>
            <strong>A login and its employee record stay in sync.</strong> Deactivating a user on the
            Users page also deactivates their employee record under Team → Employees, and reactivating
            the user reactivates it. It works the other way too: deactivating (or terminating) an
            employee who has a login deactivates that login, and activating the employee restores the
            login. Because it changes the login, only an Admin can deactivate or activate an employee
            who has one. The deactivate dialog lists any API keys the person created, with{" "}
            <strong>Revoke these keys</strong> checked by default (deactivating from the Employees page
            revokes them as well); a key that is kept shows &quot;Created by … (deactivated)&quot; in the
            API keys list and keeps working until revoked. Report schedules the person created are
            paused and their own address is removed from those schedules&apos; recipients — see Report
            Center → Scheduled to take one over. Marking the user&apos;s CRM employee record inactive has the same effect on permissions: a deactivated employee keeps no CRM or role permissions until reactivated. Setting an employee&apos;s Employment Status to <strong>Terminated</strong> does the same as deactivating them (and moving them back out of Terminated reactivates them). Deactivating or terminating an employee also takes them off every crew roster, so Start Day and Start Job no longer clock them in, payroll no longer carries them and the crew&apos;s headcount drops. Reactivating does not put them back on a crew; add them to a crew again (a Schedule Jobs Directly person gets their one-person crew back automatically). For a shared crew login, this only affects sign-in — to take the crew itself
            off the Dispatch Board, turn it off under Team → Crews instead.
          </li>
        </ol>
        <p>
          A separate <strong>Create Crew Account</strong> flow (also Admin-only, same page) creates a
          shared login for a field crew team rather than an individual — you set a team name and a
          password directly, and the credentials are shown once, at creation time. If that password
          is lost or needs changing later, an Admin can set a new one for the account directly from
          the Users table. If you leave the optional Login Email blank, the login gets an
          auto-generated address ending in <code>@crew.landscapt.com</code>; those aren&apos;t real
          mailboxes, so they can&apos;t receive a normal password-reset email. Type a real email
          instead if you want one.
        </p>
        <p>
          Creating a crew account also creates a matching Landscapt crew and links the login to it,
          so the crew has a schedule the first time they sign in. If a crew with the same name
          already exists and has no login, that crew is linked instead. You can re-link or unlink
          at any time under Team → Crews → <strong>Linked Login</strong>. The password must not be
          a common or previously breached one — a weak password is rejected with a message asking
          for a longer, less guessable one.
        </p>
      </Section>

      <Section id="worked-example" title="Worked example: inviting a Staff member">
        <p>
          An Admin invites <code>maria@greenlawn.com</code> as <strong>Staff</strong>. What
          happens immediately, and what doesn&apos;t:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Maria gets an invite email and sets her own password.</li>
          <li>
            On first login she has full Equipt access: she can create and manage work orders (not
            just ones assigned to her), log labor and meter readings, submit maintenance requests,
            and create purchase requisitions and POs for maintenance parts.
          </li>
          <li>She <strong>cannot</strong> approve any requisition or PO — Staff isn&apos;t an eligible approver role.</li>
          <li>She <strong>cannot</strong> open Settings, invite other users, or change anyone&apos;s role.</li>
          <li>
            She <strong>cannot</strong> open Landscapt/CRM at all yet — inviting her as Staff
            only set her organization role. If she also needs CRM access (say, to see client jobs
            tied to a work order), an admin has to link her login to an employee record under
            Team → Employees and give it one of your Landscapt roles. Until that happens, every
            Landscapt page is blocked for her.
          </li>
        </ul>
      </Section>

      <Section id="crew-portal" title="Crew accounts and the client portal">
        <p>Two more access modes exist outside the organization-role / CRM-role pair above:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Crew accounts</strong> — a shared login (organization role Crew)
            for a field team rather than a person. A crew login is confined to the crew field
            surface only: viewing and completing assigned jobs, submitting maintenance requests,
            viewing the Labor Efficiency and Driver Safety Scores dashboards, and uploading photos
            to job sites. It has no access to purchasing, assets, inventory, settings, or the rest
            of Landscapt — opening any other Landscapt page is blocked, whatever Landscapt role the
            crew might otherwise have.
            <p className="mt-2">
              What a crew login can <em>change</em> is deliberately narrow: it may update only the
              visits belonging to its own crew, and cannot move a visit to a different crew. Jobs and
              job service lines are read-only to a crew account, so a crew can never alter a
              service&apos;s price — pricing is only editable by staff roles with the relevant
              permission. Nor can a crew change the price or quantity on one of its own visits.
              Invoices and payments are not readable by a crew login at all.
            </p>
            <p className="mt-2">
              What a crew login can <em>see</em> about money is limited to what the crew app shows.
              Job prices and totals, labor and material costs, and the price and cost of materials on
              a job are never available to a crew login — not on screen and not by reading the data
              some other way with the crew&apos;s login. The one exception is each
              service&apos;s price on a stop, and only while <strong>Hide pricing from crew
              accounts</strong> is off. For the same reason, reports built on jobs and visits
              (revenue, rates, job costing, budget vs. actual) return no data to a crew login, even on
              a dashboard marked visible to crews.
            </p>
          </li>
          <li>
            <strong>Hiding prices from crews.</strong>{" "}
            <strong>Settings → Landscapt → Hide pricing from crew accounts</strong> stops service
            prices from being sent to crew devices at all — not merely hidden on screen. With it on,
            the database won&apos;t return a service price to a crew login, so prices can&apos;t be
            recovered from a shared tablet. Leave it off if you want crews to see each
            service&apos;s price on their stops. Job totals and costs are never shown to crews either
            way.
          </li>
          <li>
            <strong>Client portal accounts</strong> — an entirely different login system for
            Landscapt&apos;s customers (not staff), separate from everything on this page. A client
            portal login can only ever see that client&apos;s own account — billing, services,
            estimates, tickets, and documents — never any staff surface. See{" "}
            <GuideLink href="/settings/support/client-portal-guide" className="text-[#60ab45] hover:underline">
              the Client Portal guide
            </GuideLink>{" "}
            for how portal access is granted and what a client can do with it.
          </li>
        </ul>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Role dropdown looks editable, isn&apos;t always effective.</strong> Non-admins see
            the role selector as disabled, but the real protection is in the system itself — a
            non-admin&apos;s role change is refused however it&apos;s attempted. The disabled control is
            just there to avoid misleading anyone.
          </li>
          <li>
            <strong>Changing someone&apos;s organization role never touches their CRM role.</strong>{" "}
            Moving a user from Staff to Manager doesn&apos;t grant or revoke any CRM
            permissions — those two systems are independent, so check both when adjusting access.
          </li>
          <li>
            <strong>Photo Module access is a separate per-user toggle</strong>, not tied to
            organization role — except Admins, who always have it on, and Requestors, for whom it
            doesn&apos;t apply.
          </li>
          <li>
            <strong>A role can&apos;t be deleted while employees hold it.</strong> An employee whose
            Landscapt role is gone would lose Landscapt access with nothing on their record to say
            why, so Landscapt refuses to delete a role while employees are still assigned to it (&quot;N employees are still assigned to this
            role. Reassign them to another role first.&quot;); move them to another role, then
            delete.
          </li>
          <li>
            <strong>The employee record has a third, unrelated &quot;User Role&quot; field — it grants nothing.</strong>{" "}
            Team → Employees → an employee&apos;s User Settings tab shows a{" "}
            <strong>User Role</strong> field with options like Admin, Manager, Staff, Purchaser,
            and Viewer — the same familiar names as the organization role. It is purely a display
            label and has no effect on access anywhere in the app. Once the employee is linked to a login, it&apos;s auto-populated from that login&apos;s
            real organization role and shown read-only, so it can&apos;t drift out of sync — before a
            login is linked, it&apos;s just a manually-set label. Don&apos;t confuse it with either the
            organization role or the <strong>Landscapt Role</strong> field on the same tab.
          </li>
        </ul>
      </Section>
      <Section id="good-to-know" title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Deactivating a role.</strong> An inactive role grants nothing, so Landscapt asks before deactivating one and says how many active employees hold it. A role that active employees still hold can&apos;t be deactivated or deleted until they&apos;re moved to another role.
          </li>
          <li>
            <strong>The owner&apos;s employee record.</strong> Signing up creates an employee record for the owner with the Owner role, so they show up in sales rep and assignee pickers and in My Day&apos;s “Mine” view from day one.
          </li>
          <li>
            <strong>Who can change a role or linked login.</strong> On an employee record, only an admin can change the Landscapt Role or link and unlink a login. Other roles with Edit Employee see those controls disabled.
          </li>
          <li>
            <strong>Permission changes apply within a minute.</strong> A changed role reaches people already signed in within about a minute, or as soon as they return to the browser tab.
          </li>
          <li>
            <strong>Sequence approvals.</strong> Approving or rejecting a held automation message needs an admin, a manager, or Create/Modify Automation. The Approvals button is hidden from everyone else.
          </li>
          <li>
            <strong>Report Center data.</strong> Running reports needs View Report Center, checked in the database as well as on the page. Crew logins can still see the dashboards shared with crews.
          </li>
          <li>
            <strong>Invites.</strong> An invite can only give a Landscapt role that is active. Inviting someone whose old employee record is inactive (a re-hire) links and reactivates that record.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
