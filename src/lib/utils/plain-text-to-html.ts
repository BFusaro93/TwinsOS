/**
 * Converts a blank-line-separated plain-text email body into paragraph HTML.
 *
 * Text that already contains markup is returned untouched — bodies written in
 * the rich-text editor, or filled in from a Documents template, are already
 * HTML and must not be paragraph-wrapped a second time.
 *
 * Shared between the automation send path (so a hand-typed multi-paragraph
 * body doesn't arrive as one run-on paragraph — blank lines and single line
 * breaks both collapse in HTML) and the email-event editor, which runs a
 * legacy plain-text body through it before handing it to the rich-text
 * editor. Both sides must agree or an old body would render differently in
 * the editor than it does in the client's inbox.
 */
export function plainTextToHtml(text: string): string {
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 12px 0">${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
