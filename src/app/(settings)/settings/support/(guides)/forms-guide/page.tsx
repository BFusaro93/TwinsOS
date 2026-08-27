import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const FIELD_TYPES: [string, string][] = [
  ["text", "Single-line text"],
  ["email", "Single-line, expected to hold an email address"],
  ["phone", "Single-line, expected to hold a phone number"],
  ["textarea", "Multi-line text"],
  ["number", "Numeric input"],
  ["date", "Date picker"],
  ["select", "Dropdown, single choice"],
  ["checkbox", "Single on/off checkbox"],
];

const FIELD_TYPES_ADVANCED: [string, string][] = [
  ["multiple_choice", "Radio-style single choice among several options"],
  ["checklist", "Multiple choices, more than one selectable"],
  ["rating", "Star/number rating scale"],
  ["review", "A longer-form testimonial/review field"],
  ["hidden", "Not shown to the visitor — carries a fixed or pre-filled value"],
  ["sms_optin", "SMS consent checkbox, for text-message opt-in language"],
];

const FIELD_TYPES_LAYOUT: [string, string][] = [
  ["header", "A section heading, no input"],
  ["paragraph", "Block of static text, no input"],
  ["divider", "A visual rule between sections"],
];

const EMBED_MODES: [string, string, string][] = [
  ["Direct Link", "{origin}/forms/{slug} — the public page itself, nothing embedded", "Social posts, email signatures, text messages, QR codes — anywhere you just need one URL"],
  ["iFrame", "A raw <iframe> snippet pointed at the form URL", "A static site or page builder where you can paste HTML and a fixed-height embed is fine"],
  ["Script", "A <script> snippet that builds the iframe itself and listens for a twins-form-height postMessage to auto-resize the embed to fit the form's content", "A CMS page (or any site) where the form's height may change — multi-step fields, validation errors, conditional fields — and you don't want a scrollbar inside the embed"],
];

export default function FormsGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Forms & Lead Capture"
        description="Building, publishing, and sharing public forms — and what happens to a submission once it lands."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where-to-find-it">Where to find it</TOCLink>
          <TOCLink href="#building-a-form">Building a form</TOCLink>
          <TOCLink href="#worked-example">Worked example: Free Estimate Request</TOCLink>
          <TOCLink href="#configure">Configure tab: what each setting does</TOCLink>
          <TOCLink href="#publishing">Publishing</TOCLink>
          <TOCLink href="#embedding">Embedding &amp; sharing</TOCLink>
          <TOCLink href="#submission-flow">What happens on submission</TOCLink>
          <TOCLink href="#response-workflow">Responses tab &amp; the review workflow</TOCLink>
          <TOCLink href="#gotchas">One thing to know before you share a form</TOCLink>
          <TOCLink href="#spam-protection">Bot / spam protection (Cloudflare Turnstile)</TOCLink>
        </div>
      </div>

      <Section id="where-to-find-it" title="Where to find it">
        <p>
          Forms live under <strong>Landscapt → Communication → Forms</strong>{" "}
          (<code>/crm/communication/forms</code>). The list shows every form in your org. Opening
          one takes you to its detail page (<code>/crm/communication/forms/[id]</code>), which has
          three tabs:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Design</strong> — the drag-and-drop field builder.</li>
          <li><strong>Configure</strong> — confirmation behavior, notification emails, Account Management, and Tags on Submit.</li>
          <li><strong>Responses</strong> — every submission, with a status you can act on.</li>
        </ul>
        <p>
          Once published, the form itself is publicly reachable at{" "}
          <code>/forms/[slug]</code> — no login required. That page is what a visitor actually
          sees and fills out.
        </p>
      </Section>

      <Section id="building-a-form" title="Building a form">
        <p>
          The Design tab groups field types into four categories. Every field can be marked{" "}
          <strong>required</strong> individually — there&apos;s no form-level &quot;require
          everything&quot; toggle, it&apos;s a per-field flag.
        </p>
        <p className="font-semibold text-[#0a0a0a]">Simple</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field type</th>
              <th className="px-3 py-2">What it is</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {FIELD_TYPES.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"><code>{name}</code></td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="font-semibold text-[#0a0a0a]">Advanced</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field type</th>
              <th className="px-3 py-2">What it is</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {FIELD_TYPES_ADVANCED.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"><code>{name}</code></td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="font-semibold text-[#0a0a0a]">Layout</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Field type</th>
              <th className="px-3 py-2">What it is</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {FIELD_TYPES_LAYOUT.map(([name, desc]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"><code>{name}</code></td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="font-semibold text-[#0a0a0a]">Widget</p>
        <p>
          <code>attachment</code> — lets a visitor upload a file with their submission. See{" "}
          <a href="#gotchas" className="text-[#60ab45] hover:underline">below</a> for the size/type
          limit that applies to it.
        </p>
      </Section>

      <Section id="worked-example" title="Worked example: Free Estimate Request">
        <p>
          A complete lead-capture form, built end to end, using only settings covered on this
          page.
        </p>
        <p className="font-semibold text-[#0a0a0a]">Design tab — fields, in order</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li><code>header</code> — &quot;Request a Free Estimate&quot;</li>
          <li><code>text</code> — Full Name, required</li>
          <li><code>email</code> — Email, required</li>
          <li><code>phone</code> — Phone, required</li>
          <li><code>text</code> — Service Address, required</li>
          <li><code>select</code> — Service Interested In (Lawn Care, Landscaping, Snow Removal, Other), required</li>
          <li><code>textarea</code> — Anything else we should know?, optional</li>
        </ol>
        <p className="font-semibold text-[#0a0a0a]">Configure tab</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Confirmation</strong> — type <em>message</em>: &quot;Thanks! A member of our
            team will follow up within one business day to schedule your free estimate.&quot;
          </li>
          <li>
            <strong>Account Management</strong> — auto-manage <em>on</em>, matching strategy{" "}
            <em>email</em>. A submission whose email matches an existing client attaches to that
            client; otherwise a new client is created with status <code>lead</code>.
          </li>
          <li>
            <strong>Tags on Submit</strong> — add tag <em>&quot;Website Lead&quot;</em> to the
            resulting client, every time.
          </li>
        </ul>
        <p>
          Publish the form, then share the Direct Link on the site&apos;s &quot;Get a Quote&quot;
          button — see <a href="#embedding" className="text-[#60ab45] hover:underline">Embedding
          &amp; sharing</a> for the other two options.
        </p>
        <p>
          Result: every submission becomes an open ticket immediately, and because auto-manage is
          on and the email matches cleanly, the response also lands as <code>completed</code> with
          a <code>lead</code> client already tagged and attached — no manual matching needed. See{" "}
          <a href="#response-workflow" className="text-[#60ab45] hover:underline">Responses tab
          &amp; the review workflow</a> for what changes if auto-manage were off instead.
        </p>
      </Section>

      <Section id="configure" title="Configure tab: what each setting does">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Confirmation</strong> — what the visitor sees immediately after submitting.
            Either an on-page <em>message</em> (text you write) or a <em>url</em> redirect to
            another page (e.g. a thank-you page on your marketing site).
          </li>
          <li>
            <strong>Email notifications</strong> — recipients, from address, subject, and body are
            all configurable, with merge tags available in subject/body and an &quot;Include a
            copy&quot; toggle for CC&apos;ing the submitter.
          </li>
          <li>
            <strong>Account Management</strong> — the auto-manage on/off toggle, an update
            strategy (<code>replace_all</code> or <code>add_new</code>), and a matching strategy (
            <code>email</code>, <code>name_and_email</code>,{" "}
            <code>name_email_and_company</code>, or <code>custom</code>). This block decides
            whether a submission gets tied to a client automatically — see{" "}
            <a href="#submission-flow" className="text-[#60ab45] hover:underline">
              What happens on submission
            </a>{" "}
            for the effect.
          </li>
          <li>
            <strong>Tags on Submit</strong> — separate add/remove tag lists applied to the
            resulting client record on every submission.
          </li>
        </ul>
      </Section>

      <Section id="publishing" title="Publishing">
        <p>
          A form has exactly two statuses: <strong>draft</strong> and <strong>published</strong>.
          Nothing else — no &quot;archived&quot; or &quot;closed&quot; state for the form itself.
        </p>
        <Callout>
          Publishing isn&apos;t just a UI toggle — the public submit route filters on{" "}
          <code>status = &quot;published&quot;</code> server-side. A draft form&apos;s public URL
          will not load, no matter who has the link.
        </Callout>
      </Section>

      <Section id="embedding" title="Embedding & sharing">
        <p>Three ways to put a published form in front of someone, all built off the same slug.</p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">What it gives you</th>
              <th className="px-3 py-2">When to use it</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {EMBED_MODES.map(([name, what, when]) => (
              <tr key={name} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{name}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{what}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{when}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="submission-flow" title="What happens on submission">
        <p>Every submission, without exception, does two things immediately:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Creates a CRM ticket with status <code>open</code>.</li>
          <li>
            Fires the <code>form_submitted</code> automation trigger — the same event that feeds
            Communication Automations sequences. See{" "}
            <a href="/settings/support/automations-guide" className="text-[#60ab45] hover:underline">
              the Automations guide
            </a>{" "}
            for what you can chain off of it.
          </li>
        </ol>
        <p>What happens next depends on the Account Management setting on that form:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Auto-manage on</strong> — the submission is matched (or a new client is
            created) using the configured matching strategy, <code>related_client_id</code> is
            set, and the response status becomes <code>completed</code>. A client created this way
            starts at status <code>lead</code>, not <code>active</code>.
          </li>
          <li>
            <strong>Auto-manage off</strong> — <code>related_client_id</code> may still get set,
            but the response status is <code>on_hold</code> pending manual staff review on the
            Responses tab.
          </li>
        </ul>
      </Section>

      <Section id="response-workflow" title="Responses tab & the review workflow">
        <p>
          Response status is a separate concept from form status — it applies per submission, not
          to the form as a whole. Four values exist:
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Meaning</th>
            </TableHeadRow>
          </thead>
          <tbody>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"><code>completed</code></td>
              <td className="px-3 py-2 text-[#4a4a46]">Auto-managed and matched/created a client automatically. No action needed.</td>
            </tr>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"><code>on_hold</code></td>
              <td className="px-3 py-2 text-[#4a4a46]">Auto-manage was off (or matching wasn&apos;t confident enough) — a staff member needs to review and manually attach or create the client.</td>
            </tr>
            <tr className="border-b border-[#eceae3]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"><code>spam</code></td>
              <td className="px-3 py-2 text-[#4a4a46]">Set manually by staff on the Responses tab. There is no automatic spam detection — see the Callout below.</td>
            </tr>
            <tr>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]"><code>ignored</code></td>
              <td className="px-3 py-2 text-[#4a4a46]">Also set manually — for a legitimate but not-actionable submission a staff member wants out of the queue without calling it spam.</td>
            </tr>
          </tbody>
        </Table>
        <p>
          In practice: check the Responses tab for anything sitting at <code>on_hold</code>,
          decide whether it&apos;s a real lead, and either attach it to an existing client, let it
          create a new one, or mark it <code>spam</code>/<code>ignored</code> to clear it from the
          queue.
        </p>
      </Section>

      <Section id="gotchas" title="One thing to know before you share a form">
        <p>
          <strong>Attachment field limit.</strong> The server-enforced limit on the{" "}
          <code>attachment</code> field type is <strong>15 MB, images or PDF only</strong> — anything
          larger or a different file type is rejected at submission. Design any form using an
          attachment field around that limit.
        </p>
      </Section>

      <Section id="spam-protection" title="Bot / spam protection (Cloudflare Turnstile)">
        <p>
          Public form pages can show a Cloudflare Turnstile challenge before allowing submission —
          it&apos;s opt-in at the environment level, not per-form. Set{" "}
          <code>NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> and <code>TURNSTILE_SECRET_KEY</code> (see{" "}
          <code>.env.local.example</code>) and every public form immediately shows the widget and
          rejects submissions that don&apos;t pass server-side verification. Leave both unset and
          forms behave exactly as before — no widget, no verification.
        </p>
        <Callout>
          Until those keys are configured, there is still no automated gate — anyone with the
          Direct Link (or who finds an embedded form) can submit repeatedly. The manual{" "}
          <code>spam</code>/<code>ignored</code> response statuses on the Responses tab remain the
          backstop either way, since Turnstile only blocks obvious bots, not a determined human.
        </Callout>
      </Section>
    </DocsFontScope>
  );
}
