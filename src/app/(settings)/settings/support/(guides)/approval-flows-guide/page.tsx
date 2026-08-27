import Link from "next/link";
import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const STATE_TRANSITIONS: [string, string, string][] = [
  ["draft", "pending_approval", "Requester submits the requisition or PO for approval."],
  ["pending_approval", "approved", "Every step in the flow has been approved, in order — the last step's approval resolves the whole chain."],
  ["pending_approval", "rejected", "Any current-step approver rejects. This is immediate — later steps never get a chance to weigh in."],
  ["approved", "ordered", "The PO is sent to the vendor (requisitions convert to a PO at this point, or an already-approved PO is marked ordered)."],
  ["ordered", "closed", "Receiving/invoice matching for the PO is complete."],
];

const STEP_FIELDS: [string, string][] = [
  ["Label", "A short name shown on the step, e.g. “Manager Approval” or “Finance Sign-off.”"],
  ["Required Role", "For Requisitions/POs: admin, manager, or purchaser. (Estimate Approval in the CRM uses its own CRM roles instead — see below.)"],
  ["Assign To", "Either a specific person, or “Any [role]” — every user holding that role is notified, and the first one to decide resolves the step."],
  ["Dollar Threshold", "The request total this step activates at. $0 means the step always runs. A non-zero amount means the step is skipped entirely for anything under that total."],
];

export default function ApprovalFlowsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Administration"
        title="Approval Flows"
        description="How Requisition and Purchase Order approval chains are configured, processed, and resolved."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#two-flows">Two separate flows</TOCLink>
          <TOCLink href="#adding-steps">Adding and configuring steps</TOCLink>
          <TOCLink href="#worked-example">Worked example: a 2-step requisition chain</TOCLink>
          <TOCLink href="#state-machine">The approval state machine</TOCLink>
          <TOCLink href="#notifications">Notifications</TOCLink>
          <TOCLink href="#superseded">Why can&apos;t I approve my own requisition?</TOCLink>
          <TOCLink href="#crm-estimates">How this differs from Estimate Approval (CRM)</TOCLink>
        </div>
      </div>

      <Section id="two-flows" title="Two separate flows">
        <p>
          Approval Flows live under <strong>Settings → Approval Flows</strong>. Requisitions and
          Purchase Orders each get their own independently configured chain — enabling or editing
          the Requisition flow has no effect on the Purchase Order flow, and vice versa. Both are
          part of Equipt&apos;s procurement backbone, shared with Landscapt the same way Vendors are.
        </p>
        <p>
          If no flow has been created yet for an entity type, the page shows an{" "}
          <strong>Initialize Default Flows</strong> button that creates an empty “Requisition
          Approval” and/or “Purchase Order Approval” flow with zero steps. A flow with zero steps
          means nothing is gated — the requisition or PO can move straight through without needing
          any approval at all.
        </p>
      </Section>

      <Section id="adding-steps" title="Adding and configuring steps">
        <p>
          Each flow is an ordered list of steps. Click <strong>Add Approval Step</strong> to append
          one, or the pencil icon on an existing step to edit it. Steps can be reordered by dragging
          them (the grip handle on the left) — order matters, since steps are processed strictly in
          sequence. Every field on a step:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">What it controls</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STEP_FIELDS.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Changes to a flow auto-save about 400ms after you stop editing (a <strong>Save
          Changes</strong> button also appears while a change is unsaved, in case you want to save
          immediately or navigate away right after editing).
        </p>
      </Section>

      <Section id="worked-example" title="Worked example: a 2-step requisition chain">
        <p>
          Say you want small requisitions to clear quickly, but anything sizable to also get a
          named admin&apos;s sign-off. Configure the Requisition Approval flow with two steps, in
          this order:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Step 1 — “Purchaser Review.”</strong> Required Role: <em>purchaser</em>. Assign
            To: <em>Any purchaser</em>. Dollar Threshold: <strong>$0</strong> (always required).
            Every user with the purchaser role is notified; whoever decides first resolves this
            step.
          </li>
          <li>
            <strong>Step 2 — “Admin Sign-off.”</strong> Required Role: <em>admin</em>. Assign To: a
            specific named admin. Dollar Threshold: <strong>$2,500</strong>. This step only opens
            once Step 1 is approved, and only activates at all if the requisition total is $2,500
            or more — a $400 requisition skips it entirely and goes straight to{" "}
            <code>approved</code> once Step 1 clears.
          </li>
        </ol>
        <p>
          A $6,000 requisition submitted under this flow needs both a purchaser and the named admin
          to approve, in that order, before it reaches <code>approved</code>. A $200 requisition
          only needs the purchaser.
        </p>
        <Callout>
          Dollar-threshold routing is a real, per-step setting (not a hypothetical) — it applies
          equally to Requisition and Purchase Order flows. A $0 threshold always runs; any other
          amount is a floor the request total must meet or exceed for that step to be required.
        </Callout>
      </Section>

      <Section id="state-machine" title="The approval state machine">
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2">What causes it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {STATE_TRANSITIONS.map(([from, to, cause], i) => (
              <tr key={i} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                  <code>{from}</code>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">
                  <code>{to}</code>
                </td>
                <td className="px-3 py-2 text-[#4a4a46]">{cause}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Only the current approver in the chain can approve or reject a given step — this is
          enforced server-side, not just hidden in the UI. A step skipped for falling under its
          dollar threshold doesn&apos;t block progress; the chain simply moves on to the next step
          as if it had approved.
        </p>
      </Section>

      <Section id="notifications" title="Notifications">
        <p>
          When a requisition or PO moves to <code>pending_approval</code>, a request row is created
          for every approver eligible on the first step (either the one assigned user, or everyone
          holding the required role). From there:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Approval requested</strong> — the next step&apos;s eligible approver(s) are
            notified in-app and by email as soon as their step becomes current.
          </li>
          <li>
            <strong>Approved</strong> — once every step has cleared, the original requester is
            notified.
          </li>
          <li>
            <strong>Rejected</strong> — the original requester is notified by email immediately,
            including the rejecting approver&apos;s comment.
          </li>
        </ul>
      </Section>

      <Section id="superseded" title="Why can't I approve my own requisition?">
        <p>
          This comes up often enough to spell out exactly what&apos;s happening, because the actual
          answer usually isn&apos;t what people expect.
        </p>
        <Callout>
          <strong>There&apos;s no rule against self-approval.</strong> If a step is assigned to
          “Any Manager” and you hold the Manager role, you are listed as an eligible approver on
          that step — even on a requisition you submitted yourself. What&apos;s actually happening
          in the common case where someone expects to see an approve button and doesn&apos;t: another
          eligible approver on that step decided first. When a step allows any user with a given
          role to approve, all of them are notified, but the first decision resolves the step — the
          other eligible approvers&apos; entries flip to <code>superseded</code> and are no longer
          actionable. Nothing was misconfigured; someone else on the team just got there first.
        </Callout>
        <p>
          If you genuinely need a specific person to hold sole approval authority for a step
          (rather than “any manager,” which fans out to the whole team), set that step&apos;s{" "}
          <strong>Assign To</strong> field to that one named person instead of leaving it on “Any
          [role].”
        </p>
      </Section>

      <Section id="crm-estimates" title="How this differs from Estimate Approval (CRM)">
        <p>
          Landscapt&apos;s Estimate Approval is a related but deliberately simpler concept — a
          single gate on an estimate, not a multi-step chain. An estimate&apos;s approval status is
          one of <code>not_required</code>, <code>pending</code>, <code>approved</code>, or{" "}
          <code>rejected</code>, and it does still support its own configurable chain of CRM-role
          based steps (Operations Manager, Sales, etc., rather than the admin/manager/purchaser
          roles used here) — but the concepts, roles, and gating rules are distinct enough from
          Requisition/PO approval that they&apos;re covered on their own page rather than repeated
          here.
        </p>
        <p>
          See{" "}
          <Link href="/settings/support/estimating-guide" className="text-[#60ab45] hover:underline">
            the Estimating guide
          </Link>{" "}
          for how Estimate Approval fits into the budget engine and estimate lifecycle.
        </p>
      </Section>
    </DocsFontScope>
  );
}
