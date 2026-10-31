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
];

const TYPE_ROWS: [string, string][] = [
  ["Client", "General emails to a client, including the emails automations send."],
  ["Estimate", "The email that goes with an estimate. Adds the estimate merge tags."],
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
          <TOCLink href="#merge-tags">Merge tags</TOCLink>
          <TOCLink href="#buttons">Buttons and where they link</TOCLink>
          <TOCLink href="#formatting">Columns, images and blank lines</TOCLink>
          <TOCLink href="#text-toolbar">The text editor toolbar</TOCLink>
          <TOCLink href="#preview-test">Preview, PDF and test emails</TOCLink>
          <TOCLink href="#settings">Template settings</TOCLink>
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
          Formatting carries into the sent email, the public proposal page and the PDF. In the PDF,
          subscript and superscript are shown smaller but not raised or lowered, and fonts map to the
          closest of the PDF&apos;s own sans-serif, serif and monospace faces.
        </Callout>
      </Section>

      <Section id="preview-test" title="Preview, PDF and test emails">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Preview</strong> shows the template with sample data (a sample client, sample
            amounts, and your company name). It does not use a real client, so tags show sample values.
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
          email</strong>. The subject line can use merge tags too. A template marked as the default is
          the one preselected when you send that kind of email.
        </p>
      </Section>
    </DocsFontScope>
  );
}
