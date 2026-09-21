import { looksLikeHtml, sanitizeHtml } from "@/lib/utils/sanitize-html";

/**
 * A line item's customer-facing description.
 *
 * estimate_line_items.estimate_desc is authored in a rich-text editor, so it
 * usually holds an HTML fragment ("<p>Lawn mowing</p>"). Rendering it as a
 * plain string prints the tags to the customer, which is what the portal's
 * estimate view was doing. Anything that is not HTML (older rows, plain text
 * typed directly) still renders as text with its line breaks preserved.
 *
 * Extracted from the public proposal page so the portal renders a description
 * exactly the way the proposal link does — the same estimate reaching a
 * customer two ways should not look different.
 */
export function LineDescription({
  html,
  className = "mt-0.5 text-sm text-slate-500",
}: {
  html: string;
  className?: string;
}) {
  if (looksLikeHtml(html)) {
    return (
      <div
        className={`${className} [&_p]:my-0.5 [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
    );
  }
  return <p className={`${className} whitespace-pre-line`}>{html}</p>;
}
