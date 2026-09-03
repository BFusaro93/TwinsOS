import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const REJECTION_REASONS: [string, string, string][] = [
  [
    "Consent bundled into general terms",
    "\"By submitting this form you agree to our Terms\" is not SMS-specific consent.",
    "Use a separate, unchecked-by-default checkbox whose own label says texting explicitly — not a blanket agreement checkbox.",
  ],
  [
    "Verbal opt-in only described, not quoted",
    "Writing \"same script as the website\" or \"staff verbally confirm consent\" without the actual words.",
    "Paste the exact sentence staff say, word for word, as your Verbal opt-in script field.",
  ],
  [
    "Verbal script judged too brief",
    "A one-line script with no business name and no rate disclaimer reads as too thin to count as real consent.",
    "Name your business, say plainly that texts will be sent, and include the literal phrase \"Msg & data rates may apply.\"",
  ],
  [
    "Missing opt-out instructions",
    "No mention of STOP/HELP anywhere in the consent language.",
    "Every consent method and every message should mention replying STOP to opt out and HELP for help.",
  ],
];

export default function SmsOnboardingGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Integrations"
        title="Setting Up Your Own Texting Number"
        description="How to fill out the business info and consent wording so carriers approve your A2P 10DLC registration on the first pass."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#overview">Overview</TOCLink>
          <TOCLink href="#business-info">Business info</TOCLink>
          <TOCLink href="#consent-copy">Writing your consent copy</TOCLink>
          <TOCLink href="#rejections">Why registrations get rejected</TOCLink>
          <TOCLink href="#sample-wording">Sample wording that gets approved</TOCLink>
          <TOCLink href="#review-time">How long review takes</TOCLink>
          <TOCLink href="#faq">FAQ</TOCLink>
        </div>
      </div>

      <Section id="overview" title="Overview">
        <p>
          Texting from your own number (instead of Landscapt&apos;s shared one) requires carriers to
          approve your business under a program called <strong>A2P 10DLC</strong>. This is done from{" "}
          <strong>Settings → Integrations → &quot;Your own texting number&quot;</strong>: fill in your
          business info once, save, then step through Continue Setup. Two of those steps — the
          business profile and the campaign — go to a real human reviewer and can take anywhere from a
          few hours to a few days.
        </p>
        <p>
          This guide exists because getting this right on the first try isn&apos;t obvious — Twins Lawn
          Service&apos;s own registration was rejected twice before it was approved, for reasons that
          weren&apos;t clear from the error messages alone. The sections below are written from exactly
          what those two rejections said and what fixed them.
        </p>
      </Section>

      <Section id="business-info" title="Business info">
        <p>
          Use your real, legal business details — carriers cross-check this against public business
          registries. A few fields worth double-checking:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Legal business name</strong> — your registered legal name, not a DBA or marketing
            name, if they differ.
          </li>
          <li>
            <strong>EIN</strong> — must match what&apos;s on file with the IRS for this exact business
            name.
          </li>
          <li>
            <strong>Website</strong> — must be a live, reachable page. If your opt-in checkbox lives on
            a specific contact/estimate-request page rather than your homepage, that specific page is
            what belongs in the website field and the opt-in URL field below — reviewers actually visit
            the URL you give them.
          </li>
        </ul>
      </Section>

      <Section id="consent-copy" title="Writing your consent copy">
        <p>
          This is the section that gets rejected most often. Carriers require two things: consent must
          be <strong>SMS-specific</strong> (not folded into a general terms-of-service agreement), and
          it must be <strong>fully described</strong>, not just referenced.
        </p>
        <p>
          The form has two consent methods — fill in both if you use both, since most landscaping
          businesses collect consent both through an online form <em>and</em> over the phone:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Method 1 — Website form opt-in.</strong> The URL field should point to the exact
            page with your opt-in checkbox. The checkbox label should be the literal text a visitor
            sees — not a summary of it. It needs to be unchecked by default and separate from your
            Submit button; submitting the form on its own must never imply SMS consent.
          </li>
          <li>
            <strong>Method 2 — Verbal opt-in script.</strong> This is the exact sentence your staff say
            out loud on the phone before enrolling someone. Write out the real words, in quotes — not a
            description of what happens. A script that&apos;s too short gets flagged (see below), so
            make sure it identifies your business by name, states plainly that texts will be sent, and
            includes the phrase <strong>&quot;Msg &amp; data rates may apply&quot;</strong> exactly.
          </li>
        </ul>
        <Callout>
          <strong>Both fields should end with opt-out instructions.</strong> Something like: &quot;Reply
          STOP to opt out at any time, HELP for help.&quot; Carriers check for this in both the checkbox
          label and the verbal script.
        </Callout>
      </Section>

      <Section id="rejections" title="Why registrations get rejected">
        <p>Every one of these came from a real rejection on a real submission — not a hypothetical.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">What triggers it</th>
              <th className="px-3 py-2">What the reviewer actually flagged</th>
              <th className="px-3 py-2">How to fix it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {REJECTION_REASONS.map(([what, flagged, fix]) => (
              <tr key={what} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-[#0a0a0a]">{what}</td>
                <td className="px-3 py-2 align-top text-[#4a4a46]">{flagged}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{fix}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          If your business profile or campaign comes back rejected, the exact reviewer note is shown
          right on the Settings page — read it carefully, since a resubmission that doesn&apos;t address
          the specific wording called out will likely be rejected again for the same reason.
        </p>
      </Section>

      <Section id="sample-wording" title="Sample wording that gets approved">
        <p>These are the shapes of wording that passed review — adapt the specifics to your own business, but keep this same structure:</p>
        <div className="rounded-md border border-[#e6e6e0] bg-[#faf9f6] p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6b6b66]">Checkbox label</p>
          <p className="font-mono text-xs leading-relaxed text-[#0a0a0a]">
            &quot;I agree to receive text messages from [Your Business] about my service appointments and
            account, including appointment reminders, crew arrival notices, and job status updates.
            Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any
            time, HELP for help.&quot;
          </p>
        </div>
        <div className="rounded-md border border-[#e6e6e0] bg-[#faf9f6] p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6b6b66]">Verbal opt-in script</p>
          <p className="font-mono text-xs leading-relaxed text-[#0a0a0a]">
            &quot;Hi, this is [staff name] with [Your Business]. Would you like to receive text message
            updates about your appointments and account? If you agree, we&apos;ll send you texts such as
            appointment reminders, crew arrival notices, and account updates. Message frequency varies.
            Msg &amp; data rates may apply. You can reply STOP at any time to cancel, or HELP for
            help.&quot;
          </p>
        </div>
        <p>
          These are pre-filled as the starting defaults on the setup form — you mainly need to swap in
          your own business name and confirm the rest still matches how you actually collect consent.
        </p>
      </Section>

      <Section id="review-time" title="How long review takes">
        <p>
          Subaccount creation and business-info submission are instant. From there, two steps go to a
          real reviewer:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Business profile review</strong> — typically a few hours, occasionally up to a day.
          </li>
          <li>
            <strong>Campaign review</strong> — can take anywhere from a few hours to several days,
            especially on a resubmission after a rejection.
          </li>
        </ul>
        <p>
          The Settings page checks status automatically in the background, or click{" "}
          <strong>Check status</strong> any time for an on-demand check. You&apos;ll see the current
          stage and, if something was rejected, the reviewer&apos;s note right there.
        </p>
      </Section>

      <Section id="faq" title="FAQ">
        <p>
          <strong>Can I edit my info after submitting?</strong> Not while a step is under review — the
          form locks to match what was actually sent to the carrier. If a step gets rejected, the
          relevant fields unlock automatically so you can fix and resubmit.
        </p>
        <p>
          <strong>Do I need a new number if I already had a personal or Google Voice number?</strong>{" "}
          No — this process provisions a brand-new number for you as part of setup; there&apos;s nothing
          to bring over.
        </p>
        <p>
          <strong>What happens to my old shared-number texts once this is approved?</strong> Nothing
          retroactive changes — new outbound texts switch to your own number and campaign once approval
          completes; nothing about message history changes.
        </p>
      </Section>
    </DocsFontScope>
  );
}
