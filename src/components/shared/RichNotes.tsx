import { looksLikeHtml, sanitizeHtml } from "@/lib/utils/sanitize-html";

/**
 * A job note as authored: rich text (stored as an HTML fragment) renders with
 * its formatting; older plain-text notes keep their line breaks. HTML goes
 * through the allowlist sanitizer before it reaches the DOM.
 */
export function RichNotes({ value, className = "text-sm text-slate-700 dark:text-neutral-300" }: {
  value: string;
  className?: string;
}) {
  if (looksLikeHtml(value)) {
    return (
      <div
        className={`${className} [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
      />
    );
  }
  return <p className={`${className} whitespace-pre-wrap`}>{value}</p>;
}
