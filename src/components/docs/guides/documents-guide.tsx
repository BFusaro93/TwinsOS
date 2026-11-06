import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const BLOCK_ROWS: [string, string][] = [
  ["Header", "A large line of rich text, for a greeting or title."],
  ["Paragraph", "Body text with bold, italic, underline, lists, alignment and images."],
  ["List", "A bulleted or numbered list."],
  ["Line Items Table", "A placeholder. The real table of line items is filled in automatically from the invoice or estimate when the email is sent."],
  ["Image", "An uploaded picture, such as your logo."],
  ["Divider / Spacer", "A thin line, or empty space, between blocks."],
  ["Signature", "Rich text for the sign-off, usually your contact details as merge tags."],
  ["Button", "A coloured button with your own label that links somewhere (see below)."],
  ["Columns", "Two or three side-by-side columns. Each column holds rich text, images and merge tags."],
  ["Estimate Grid", "Estimate documents only. A dynamic tile that shows the estimate's line items, quantities and prices wherever you place it. One per document."],
];

const TYPE_ROWS: [string, string][] = [
  ["Client", "General emails to a client, including the emails automations send. Client documents are also used as an Estimate Document's Estimate Email and Confirmation Email, so they offer the estimate merge tags and a “View proposal” button link; those only fill in when the email is sent from an estimate."],
  ["Estimate", "The proposal layout the client sees: your header, greeting, the Estimate Grid and your terms. Adds the estimate merge tags and the estimate settings (see below)."],
  ["Invoice Email", "The email that goes with an invoice. Adds the invoice merge tags, including the payment link."],
  ["Marketing", "Campaign emails."],
  ["Chemical", "Chemical application notices. Adds the products and care-instruction tags."],
  ["Text Message", "Plain SMS text. Only Paragraph blocks are available, and there is no subject line."],
];

export function DocumentsGuide() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt (CRM)"
        title="Document & Email Templates"
        description="Building the reusable emails and text messages that go out with invoices, estimates, campaigns and automations — blocks, merge tags, buttons, previews and test sends."
      />

      <div className="rounded-lg border border-[#e6e6e0] dark:border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642] dark:text-[#9ebfb7]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#where">Where templates live</TOCLink>
          <TOCLink href="#types">Template types</TOCLink>
          <TOCLink href="#blocks">Blocks</TOCLink>
          <TOCLink href="#estimate-docs">Estimate documents</TOCLink>
          <TOCLink href="#merge-tags">Merge tags</TOCLink>
          <TOCLink href="#buttons">Buttons and where they link</TOCLink>
          <TOCLink href="#formatting">Columns, images and blank lines</TOCLink>
          <TOCLink href="#text-toolbar">The text editor toolbar</TOCLink>
          <TOCLink href="#preview-test">Preview, PDF and test emails</TOCLink>
          <TOCLink href="#settings">Template settings</TOCLink>
          <TOCLink href="#copy">Copying a template</TOCLink>
          <TOCLink href="#accepted-email">The estimate-accepted confirmation email</TOCLink>
          <TOCLink href="#good-to-know">Good to know</TOCLink>
        </div>
      </div>

      <Section id="where" title="Where templates live">
        <p>
          In the Landscapt sidebar, under <strong>Administration</strong>, click <strong>Documents</strong>.
          The list shows each template&apos;s title, type, description and last-modified date; click a
          title to open the editor, and use <strong>Add Document</strong> to start a new one. You need the
          document template permission to see the page. Pick a template when you send an invoice,
          estimate or bulk email, or in an automation&apos;s email step, and its content fills the message
          for you to review before it goes out.
        </p>
      </Section>

      <Section id="types" title="Template types">
        <p>
          The type decides which merge tags are offered in the editor.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Used for</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {TYPE_ROWS.map(([t, d]) => (
              <tr key={t} className="border-b border-[#eceae3] dark:border-border last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{t}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{d}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="blocks" title="Blocks">
        <p>
          A template is a stack of blocks. Add one from the panel on the right, then move it up or down or
          delete it with the small controls that appear when you hover it. Click a block to make it the
          active one.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Block</th>
              <th className="px-3 py-2">What it is</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {BLOCK_ROWS.map(([b, d]) => (
              <tr key={b} className="border-b border-[#eceae3] dark:border-border last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a] dark:text-neutral-100">{b}</td>
                <td className="px-3 py-2 text-[#4a4a46] dark:text-neutral-300">{d}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>Click <strong>Save Changes</strong> in the top bar to keep your edits; the button reads Saved when there is nothing new.</p>
      </Section>

      <Section id="estimate-docs" title="Estimate documents">
        <p>
          An Estimate document is the proposal itself, built in the same editor as every other template.
          It works together with two Client-type documents, so an estimate setup is three documents:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>The Estimate document</strong> is the layout the client sees on the online proposal
            and in the PDF.
          </li>
          <li>
            <strong>The Estimate Email</strong> is a Client-type document that carries the estimate to
            the client. Include an <code>[estimatelink]</code> tag or a button that links to{" "}
            <code>[estimatelink]</code> so the client can open and accept the proposal.
          </li>
          <li>
            <strong>The Estimate Confirmation Email</strong> is a second Client-type document sent
            when the client accepts.
          </li>
        </ul>
        <p>
          <strong>Building the layout.</strong> When you add a new Document of type Estimate, leave{" "}
          <strong>Start from the standard layout</strong> ticked to begin with a company header
          (<code>[companyname]</code>, <code>[companyaddress]</code> and the other company tags) in a
          Columns block beside a spot for your logo, a greeting, the <strong>Estimate Grid</strong>, a
          divider and a terms section. Click the logo box and use the Insert image button to add your
          logo, then replace the terms text with your own. Or start blank and add the blocks yourself.
        </p>
        <p>
          The <strong>Estimate Grid</strong> block appears in the Add Block panel only on Estimate
          documents, once per document. In the editor it is a dashed box labelled Estimate Grid; the real
          table of the estimate&apos;s line items is filled in when the proposal is sent or viewed. In
          Preview it shows a sample table.
        </p>
        <p>
          <strong>The estimate settings.</strong> On an Estimate document, <strong>Edit Settings</strong>{" "}
          (and the New Document window) add these:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Estimate Email.</strong> Pick an active Client-type document. If it has no{" "}
            <code>[estimatelink]</code> tag or button link, a warning says the email will not link to the
            proposal. It does not stop you from saving.
          </li>
          <li>
            <strong>Include PDF In Email.</strong> Attach the estimate as a PDF to the estimate email.
          </li>
          <li>
            <strong>Estimate Confirmation Email.</strong> Pick the active Client-type document sent
            when the client accepts. The same <code>[estimatelink]</code> warning applies.
          </li>
          <li>
            <strong>Send Confirmation To.</strong> <strong>Use Contact Email By Default</strong> sends
            to the client&apos;s primary email; <strong>Billing Email</strong> sends to their billing
            email.
          </li>
          <li>
            <strong>Send Estimate PDF in Client Confirmation.</strong> Off by default. Turn it on to
            attach the estimate PDF to the confirmation.
          </li>
          <li>
            <strong>Set What The Client Sees For This Document.</strong> Off by default. Tick it to
            choose the client-view toggles (visits, quantities, units, line prices, line totals, section
            subtotals, hide $0 totals, hide $0 prices) that estimates using this document start with.
            Leave it off and the document sets none, so the service bundle or your org default applies.
          </li>
        </ul>
        <p>
          <strong>How the toggles reach an estimate.</strong> The toggles are copied onto an estimate
          when it uses the document, so editing the document later never changes estimates you already
          created or proposals you already sent. The order, most specific first: the
          estimate&apos;s own toggles, then the estimate document&apos;s, then the service
          bundle&apos;s, then the org default.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>New estimate from a bundle.</strong> If the bundle links an Estimate document that
            sets toggles, those are used. Otherwise the bundle&apos;s own Display Settings are used,
            then the org default.
          </li>
          <li>
            <strong>Picking or changing the Estimate Document on an estimate.</strong> If the document
            sets toggles, they are copied onto the estimate. If it sets none, the estimate keeps its
            current toggles.
          </li>
          <li>
            <strong>Applying a bundle to an existing estimate.</strong> The bundle&apos;s linked
            document toggles (or the bundle&apos;s own) are copied on, and the bundle&apos;s document
            replaces the estimate&apos;s document.
          </li>
          <li>
            <strong>If you changed the toggles by hand first.</strong> Each of the above asks{" "}
            <strong>Replace the client-view settings?</strong> with <strong>Keep mine</strong> or{" "}
            <strong>Replace toggles</strong>. Keep mine still switches the document or adds the bundle
            lines but leaves your toggles alone. No question is asked when you have not changed them,
            or when they already match.
          </li>
          <li>
            <strong>Automatic.</strong> An estimate on <strong>Automatic</strong> has no document of its
            own, so sending or previewing uses your default estimate document, or the built-in layout if
            none is the default. Automatic does not copy that default document&apos;s toggles onto the
            estimate; only picking a document (or applying a bundle that links one) does.
          </li>
        </ul>
        <p>
          Leave a picker on <strong>Standard built-in email</strong> to use the built-in message instead.
          The pickers list only active Client documents, and an Estimate document is never offered as its
          own email. These settings are hidden on documents of other types.
        </p>
      </Section>

      <Section id="merge-tags" title="Merge tags">
        <p>
          Merge tags such as <code>[clientfirstname]</code> or <code>[invoicetotal]</code> are replaced with
          real values when the email is sent. The Merge Tags panel on the right lists the tags for this
          template&apos;s type, grouped (Client, Property, Company, Invoice and so on), with a search box.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Inserting a tag.</strong> Click into a Header, Paragraph, List, Signature or Columns
            block, then click a tag. It is inserted at your cursor. Inside a Columns block, it goes into the
            column you last clicked.
          </li>
          <li>
            <strong>No block selected?</strong> If no text block is active, clicking a tag copies it to your
            clipboard instead, and a notice says so. Click into a block first to have it inserted for you.
          </li>
          <li>
            <strong>Spaces between tags.</strong> Tags are inserted exactly as they are. Two tags side by
            side with no space or comma run together (<code>[clientfirstname][companyname]</code> becomes
            &quot;JaneLandscapt Lawn &amp; Landscape&quot;), so type your own separator.
          </li>
          <li>
            <strong>Notice of Treatment.</strong> <code>[chemicalnotice]</code> drops the compact
            Notice of Treatment for the last completed visit that logged chemicals into an email or
            automation, and is blank when that visit logged none. It is the way a contract client, who
            gets no invoice, still receives the record. The invoice tags
            (<code>[invoicenumber]</code>, <code>[invoicetotal]</code>, <code>[paymentlink]</code> and so
            on) and the service tags (<code>[servicename]</code>, <code>[servicedate]</code>,
            <code>[nextservicename]</code>, <code>[nextservicedate]</code>) fill in for automations; see the
            Automations guide.
          </li>
          <li>
            <strong>Every listed tag works on every send.</strong> Estimate emails, the online proposal and
            its PDF, the acceptance confirmation and chemical notices all fill in the full client, billing,
            property and company tags, not just the client name. On a document about a specific property
            (an estimate with a property, a visit&apos;s Notice of Treatment), the property tags
            (<code>[physicaladdress1]</code>, takeoffs, gate code) come from that property rather than the
            client&apos;s main service address. <code>[salesperson]</code> and <code>[salesrepname]</code>{" "}
            name the estimate&apos;s own sales rep (the company name only when none is set), and{" "}
            <code>[invoicegrid]</code> prints the invoice&apos;s lines as a table.
          </li>
          <li>
            <strong>Empty tags.</strong> A tag that has no value for this client or record is left blank in
            the sent email rather than showing the bracket text.
          </li>
        </ul>
      </Section>

      <Section id="buttons" title="Buttons and where they link">
        <p>
          A Button block has two settings: the label you type, and <strong>Button links to</strong> under it.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Invoice Email templates</strong> offer <strong>View &amp; pay invoice online</strong>,
            which links each client to their own invoice page, plus a custom URL.
          </li>
          <li>
            <strong>Every template type</strong> can use <strong>Custom URL</strong>. Enter a full address
            starting with <code>https://</code>, <code>mailto:</code> or <code>tel:</code>. Anything else is
            ignored and the button goes nowhere.
          </li>
        </ul>
        <Callout>
          The button link works in the email itself. In an attached PDF the button is drawn as a green
          shape but is not clickable.
        </Callout>
      </Section>

      <Section id="formatting" title="Columns, images and blank lines">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Columns.</strong> The Columns block has a 2 or 3 control. Switching from 3 to 2 keeps
            the third column&apos;s text, so switching back loses nothing.
          </li>
          <li>
            <strong>Images.</strong> Where the editor allows images, hover an image and drag a corner
            handle to resize it. The aspect ratio is kept and the size carries into the preview, the
            email and the PDF. An <strong>Image</strong> block has a <strong>Size</strong> slider
            (10&ndash;100% of the width) instead. Images work in the PDF whatever the file type
            (JPG, PNG, WEBP, GIF or AVIF).
          </li>
          <li>
            <strong>Blank lines.</strong> Pressing Enter twice leaves a visible blank line, and it stays in
            the preview, the sent email and the PDF instead of collapsing.
          </li>
        </ul>
      </Section>

      <Section id="text-toolbar" title="The text editor toolbar">
        <p>
          Every rich-text box in the app uses the same toolbar: document blocks, email and invoice
          messages, service descriptions, estimate line notes and the job&apos;s notes and descriptions.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Font and size.</strong> Pick a font (Arial, Verdana, Trebuchet MS, Georgia, Times New Roman, Courier New) and a size from 10 to 32.</li>
          <li><strong>Bold, italic, underline, strikethrough, subscript and superscript.</strong></li>
          <li><strong>Text color and highlight color.</strong> Choose a swatch or a custom color; Reset removes it.</li>
          <li><strong>Bullet and numbered lists, alignment, and indent / outdent.</strong> In a list, the indent buttons nest and un-nest the item.</li>
          <li>
            <strong>Tables.</strong> The table button inserts a 3&times;3 table with a header row. With
            the cursor inside a table, the same menu adds or deletes rows and columns, toggles the header
            row and deletes the table.
          </li>
          <li><strong>Horizontal rule</strong> and <strong>Insert image</strong> (not available in every box).</li>
          <li>
            <strong>HTML source</strong> (the <code>&lt;/&gt;</code> button). Edit the raw HTML, then click
            the button again to return. Only the formatting the toolbar can produce is kept; anything
            else is removed when you switch back.
          </li>
        </ul>
        <Callout>
          Formatting carries into the sent email, the public proposal page and the PDF. Rich text in an
          estimate line&apos;s description keeps its bold, italic, underline and lists in the PDF, and any
          other formatting is dropped rather than shown as raw tags. In the PDF,
          subscript and superscript are shown smaller but not raised or lowered, and fonts map to the
          closest of the PDF&apos;s own sans-serif, serif and monospace faces.
        </Callout>
      </Section>

      <Section id="preview-test" title="Preview, PDF and test emails">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Preview</strong> shows the template with sample data (a sample client, sample
            amounts, and your company name). It does not use a real client, so tags show sample values.
            Date tags show real dates: today for [today], [estimatedate] and [invoicedate], and 30 days
            out for [invoiceduedate] and [duedate] (test emails and PDFs use your company&apos;s timezone).
            Switch between desktop and mobile width. <strong>Back to Editor</strong> returns you.
          </li>
          <li>
            <strong>Download PDF</strong> renders the template the same way and downloads it, including
            blank lines, indents, tables and images.
          </li>
          <li>
            <strong>Send Test Email</strong> sends the template, with sample data, to the email address you are
            signed in with. The subject starts with <strong>[TEST]</strong>. If the template&apos;s Include
            PDF setting is on, the test email carries the PDF as an attachment, so what you receive is the
            template rendered with sample values, not a real invoice. Your unsaved edits are included.
          </li>
        </ul>
        <p>
          If the test email fails with a message about the PDF attachment, turn off Include PDF in the
          template&apos;s settings to test without it, and contact support if it keeps happening.
        </p>
      </Section>

      <Section id="settings" title="Template settings">
        <p>
          <strong>Edit Settings</strong> in the top bar opens the template&apos;s name, type, subject line,
          description, whether it is the default for its type, and <strong>Include PDF attachment in
          email</strong> (Invoice Email documents). Estimate documents add the estimate settings
          described above. The subject line can use merge tags too. A template marked as the default is
          the one preselected when you send that kind of email.
        </p>
      </Section>

      <Section id="copy" title="Copying a template">
        <p>
          To start from an existing template instead of a blank one, click the three-dot menu at the end
          of its row on the Documents list and choose <strong>Copy</strong>. A new template appears
          named <strong>the original name (Copy)</strong>, with the same type, subject, description,
          blocks, images, Include PDF setting and, for Estimate documents, the estimate settings. It keeps the original&apos;s Active or Inactive
          status, and it is never marked as the default, so the original stays the preselected template
          until you choose otherwise. Open the copy to rename and edit it. You need the permission to
          add document templates to see Copy.
        </p>
      </Section>

      <Section id="accepted-email" title="The estimate-accepted confirmation email">
        <p>
          When a client accepts a proposal from their online link, they can receive a confirmation email
          built from one of your own templates. Go to <strong>Settings &rarr; Estimates</strong> and open
          the <strong>Accepted Email</strong> tab.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Confirmation document.</strong> Choose any active template of type Client or
            Estimate. The estimate and client merge tags, such as <code>[estimatenumber]</code>,{" "}
            <code>[estimatetotal]</code> and <code>[clientfirstname]</code>, are filled in from the
            accepted estimate, and <code>[estimatelink]</code> links to the accepted proposal. The
            template&apos;s subject line is used; if it has none, a standard subject is used. If the
            template you pick has no <code>[estimatelink]</code> tag, a warning says the email will not
            link back to the proposal. It does not stop you from saving.
          </li>
          <li>
            <strong>Send to.</strong> <strong>Billing email</strong> (the default) sends to the
            client&apos;s billing email and falls back to their primary email when no billing email is
            set. <strong>Primary email</strong> always uses the primary address.
          </li>
          <li>
            <strong>Attach the estimate PDF.</strong> Off by default. Turn it on to attach the estimate as
            a PDF to the confirmation.
          </li>
        </ul>
        <p>
          With no document selected, the standard built-in confirmation email is sent. The same happens
          if the selected template is later deactivated or deleted, and the Accepted Email tab shows a
          notice when that is the case. An address that has hard-bounced receives nothing; a client who
          has opted out of marketing still receives the confirmation, because it is a service email. If
          the confirmation cannot be sent, the acceptance itself is still recorded.
        </p>
        <p>
          The Template picker in the Send Estimate window also warns when the chosen template has no{" "}
          <code>[estimatelink]</code> tag, since the client would have no link to accept the proposal.
        </p>
      </Section>
      <Section id="good-to-know" title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Editing HTML source.</strong> Changes made in the HTML source view are kept when you click Save, Preview or Send test without switching back first.
          </li>
          <li>
            <strong>Ticket emails.</strong> Emailing from a ticket offers Client documents only, and warns if the one you pick is an estimate email (its estimate tags would be blank).
          </li>
          <li>
            <strong>Images are fetched safely.</strong> An image block that points at a web address is fetched only from a public address, never from your network or the server&apos;s.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
