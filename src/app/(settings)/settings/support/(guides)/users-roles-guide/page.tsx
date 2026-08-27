import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const STAFF_ROLES: [string, string][] = [
  ["Admin", "Full access to everything — all modules, all records, settings, approval flows, and user management."],
  ["Manager", "Full operational access across purchasing and maintenance — everything except organization settings and user management."],
  ["Purchaser", "Manages the full procurement lifecycle from requisition to receiving. Read-only on work orders."],
  ["Technician", "Executes maintenance work — creates and manages work orders (not limited to ones assigned to them), and can initiate procurement for parts."],
  ["Viewer", "Read-only across both modules. No create, edit, delete, or approve access."],
  ["Requestor", "Submits maintenance requests and draft purchase requisitions only — can't approve, edit, or delete, and has no access to assets, vendors, or inventory."],
  ["Crew", "A shared login for a field crew team (e.g. MAINT1, ENHANCE1), not an individual person — confined to the crew field surface, not the full dashboard."],
];

const MATRIX_ROWS: [string, string, string, string, string, string, string][] = [
  ["Admin",      "Yes", "Yes", "Yes", "Full", "Full (bypasses CRM role permissions entirely)", "Automatic"],
  ["Manager",    "No",  "Yes (within limit)", "No", "Full", "None by default — needs a CRM role assigned separately", "N/A"],
  ["Purchaser",  "No",  "No", "No", "Requisitions/POs/receiving/vendors full; work orders read-only", "None by default", "N/A"],
  ["Technician", "No",  "No", "No", "Work orders, PM, parts, meters full; can create requisitions/POs for parts", "None by default", "N/A"],
  ["Viewer",     "No",  "No", "No", "Read-only, all records", "None by default", "N/A"],
  ["Requestor",  "No",  "No", "No", "Maintenance requests + draft requisitions only", "None by default", "N/A"],
  ["Crew",       "No",  "No", "No", "None — confined to crew field surface", "None — confined to /crm/crew", "N/A"],
];

export default function UsersRolesGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Administration"
        title="Users, Roles & Permissions"
        description="How access works across Equipt, Landscapt, crew logins, and the client portal — and why they aren't all the same system."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#two-systems">Two separate role systems</TOCLink>
          <TOCLink href="#staff-roles">The seven organization roles</TOCLink>
          <TOCLink href="#matrix">Role permission matrix</TOCLink>
          <TOCLink href="#crm-roles">Landscapt/CRM custom roles</TOCLink>
          <TOCLink href="#inviting">Inviting a new user</TOCLink>
          <TOCLink href="#worked-example">Worked example: inviting a Technician</TOCLink>
          <TOCLink href="#crew-portal">Crew accounts and the client portal</TOCLink>
          <TOCLink href="#gotchas">Gotchas</TOCLink>
        </div>
      </div>

      <Section id="two-systems" title="Two separate role systems">
        <p>
          Equipt/PO and Landscapt/CRM access are controlled by two independent mechanisms, not one
          unified role model:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>The organization role</strong> — a single value on every user&apos;s profile
            (<code>profiles.role</code>): <code>admin</code>, <code>manager</code>,{" "}
            <code>purchaser</code>, <code>technician</code>, <code>viewer</code>,{" "}
            <code>requestor</code>, or <code>crew</code>. This is the role you pick when inviting
            someone from Settings → Users, and it&apos;s what gates Equipt (CMMS) and PO access.
          </li>
          <li>
            <strong>CRM custom roles</strong> — a completely separate, org-defined permission system
            for Landscapt, managed at CRM Settings → Roles. Each role is a named set of on/off
            switches (over a hundred of them — client access, scheduling, accounting, reports, and
            more) stored as JSONB, closer to Service Autopilot&apos;s permission model than to the
            seven fixed organization roles.
          </li>
        </ul>
        <Callout>
          <strong>These don&apos;t sync.</strong> Being a Manager or Technician (organization role)
          gives you access to Equipt/PO. It gives you <em>no</em> access to Landscapt/CRM on its own
          — CRM access requires a separate <code>crm_employees</code> link with a CRM role assigned.
          Only Admin is an exception: Admins bypass CRM permission checks entirely and get full CRM
          access automatically.
        </Callout>
      </Section>

      <Section id="staff-roles" title="The seven organization roles">
        <p>These are the only values <code>profiles.role</code> can hold. Every staff login has exactly one.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">What it means</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STAFF_ROLES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Purchaser, Technician, and Requestor only appear if your plan includes Equipt.</strong>{" "}
          A Landscapt-only org has no purchase orders, work orders, or assets for those roles to act
          on, so the invite and role dropdowns hide them until Equipt is on the plan.
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
              <tr key={row[0]} className="border-b border-[#eceae3] last:border-0">
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={
                      i === 0
                        ? "whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"
                        : "px-3 py-2 text-[#4a4a46]"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="text-xs text-[#7a7a74]">
          &quot;None by default&quot; for CRM access means the organization role alone doesn&apos;t
          grant it — an admin has to separately link the user to a CRM role via CRM Settings →
          Employees. Client portal accounts are a different login entirely — see{" "}
          <a href="/settings/support/client-portal-guide" className="text-[#60ab45] hover:underline">
            the Client Portal guide
          </a>.
        </p>
      </Section>

      <Section id="crm-roles" title="Landscapt/CRM custom roles">
        <p>
          CRM access is governed by <code>crm_roles</code> — organization-defined roles you build
          yourself at CRM Settings → Roles, not the seven fixed organization roles above. Each role
          is a flat set of permission keys (<code>client_add</code>, <code>acct_add_modify_invoices</code>,{" "}
          <code>sched_dispatch_board</code>, and well over a hundred others across Home, CRM,
          Scheduling, Accounting, and Mobile) that you toggle on or off per role.
        </p>
        <p>
          To give someone CRM access, two things have to both be true:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>They have a <code>crm_employees</code> record linked to their login.</li>
          <li>That employee record points at an active (non-deleted) <code>crm_roles</code> row — the specific CRM role that defines what they can see and do inside Landscapt.</li>
        </ol>
        <p>
          Without both, a user with a perfectly valid organization role (say, Manager) is blocked
          from the CRM module entirely — the CRM access gate checks for a <code>crm_role_id</code>,
          not for anything on <code>profiles.role</code>.
        </p>
        <Callout>
          <strong>Admins skip all of this.</strong> If <code>profiles.role === &quot;admin&quot;</code>,
          every CRM permission check passes automatically — an Admin never needs a{" "}
          <code>crm_employees</code> link or a CRM role assigned.
        </Callout>
      </Section>

      <Section id="inviting" title="Inviting a new user">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Go to <strong>Settings → Users</strong>. Only Admins see the Invite User and Create Crew Account buttons.</li>
          <li>Click <strong>Invite User</strong>, enter their name, email, and pick one of the organization roles.</li>
          <li>
            They receive an email invitation and set their own password on first login. If the email
            is already registered elsewhere in the system, a password-reset link is sent instead so
            they land on the same set-password screen.
          </li>
          <li>An Admin can resend a pending invite, change a user&apos;s role, or deactivate them at any time from the same table.</li>
        </ol>
        <p>
          A separate <strong>Create Crew Account</strong> flow (also Admin-only, same page) creates a
          shared login for a field crew team rather than an individual — you set a team name and a
          password directly, and the credentials are shown once, at creation time.
        </p>
      </Section>

      <Section id="worked-example" title="Worked example: inviting a Technician">
        <p>
          An Admin invites <code>maria@greenlawn.com</code> as a <strong>Technician</strong>. What
          happens immediately, and what doesn&apos;t:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Maria gets an invite email and sets her own password.</li>
          <li>
            On first login she has full Equipt access: she can create and manage work orders (not
            just ones assigned to her), log labor and meter readings, submit maintenance requests,
            and create purchase requisitions and POs for maintenance parts.
          </li>
          <li>She <strong>cannot</strong> approve any requisition or PO — Technician isn&apos;t an eligible approver role.</li>
          <li>She <strong>cannot</strong> open Settings, invite other users, or change anyone&apos;s role.</li>
          <li>
            She <strong>cannot</strong> open Landscapt/CRM at all yet — inviting her as Technician
            only set her organization role. If she also needs CRM access (say, to see client jobs
            tied to a work order), an admin has to separately create a <code>crm_employees</code>{" "}
            record for her at CRM Settings → Employees and assign one of the org&apos;s CRM roles.
            Until that happens, she&apos;s blocked from every CRM route.
          </li>
        </ul>
      </Section>

      <Section id="crew-portal" title="Crew accounts and the client portal">
        <p>Two more access modes exist outside the organization-role / CRM-role pair above:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Crew accounts</strong> — a shared login (organization role <code>crew</code>)
            for a field team rather than a person. A crew login is confined to the crew field
            surface only: viewing and completing assigned jobs, submitting maintenance requests,
            viewing the Labor Efficiency and Driver Safety Scores dashboards, and uploading photos
            to job sites. It has no access to purchasing, assets, inventory, settings, or the rest
            of the CRM module — even attempting to load a CRM route outside the crew surface is
            blocked, regardless of what a <code>crm_role_id</code> might otherwise allow.
          </li>
          <li>
            <strong>Client portal accounts</strong> — an entirely different login system for
            Landscapt&apos;s customers (not staff), separate from everything on this page. A client
            portal login can only ever see that client&apos;s own account — billing, services,
            estimates, tickets, and documents — never any staff surface. See{" "}
            <a href="/settings/support/client-portal-guide" className="text-[#60ab45] hover:underline">
              the Client Portal guide
            </a>{" "}
            for how portal access is granted and what a client can do with it.
          </li>
        </ul>
      </Section>

      <Section id="gotchas" title="Gotchas">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Role dropdown looks editable, isn&apos;t always effective.</strong> Non-admins see
            the role selector as disabled in the UI, but the real enforcement is server-side (RLS
            plus a database trigger) — the disabled control is just there to avoid misleading anyone.
          </li>
          <li>
            <strong>Changing someone&apos;s organization role never touches their CRM role.</strong>{" "}
            Moving a user from Technician to Manager doesn&apos;t grant or revoke any CRM
            permissions — those two systems are independent, so check both when adjusting access.
          </li>
          <li>
            <strong>Photo Module access is a separate per-user toggle</strong>, not tied to
            organization role — except Admins, who always have it on, and Requestors, for whom it
            doesn&apos;t apply.
          </li>
          <li>
            <strong>A deleted (soft-deleted) CRM role silently revokes access.</strong> If a{" "}
            <code>crm_roles</code> row an employee is assigned to gets deleted, that employee loses
            CRM access the same as if no role were assigned at all — nothing on the user record
            itself changes to indicate why.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
