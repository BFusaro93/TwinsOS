/**
 * Invoice-email "View & Pay Invoice" button handling, shared by the send route
 * and the send dialog's preview so the preview shows exactly what goes out.
 *
 * A template's Button block reaches the send dialog's rich-text editor, which
 * keeps the link but drops the inline button styling (and the centering div).
 * So a link to the invoice comes back as a bare underlined link. Here, a link
 * that sits alone in its paragraph is turned back into the branded button
 * where the author put it; a link inside a sentence is left as a normal link.
 * If the body has no invoice link at all, the caller appends the standard
 * bottom button (see invoiceBottomButtonHtml).
 */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function invoiceButtonStyle(brandColor: string): string {
  return `display:inline-block;background:${brandColor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600`;
}

export function styleInvoiceLinkButtons(
  html: string,
  invoiceUrl: string,
  brandColor: string,
): { html: string; hasInvoiceLink: boolean } {
  const url = escapeRegex(invoiceUrl);
  const anchor = `<a\\b[^>]*href=["']${url}["'][^>]*>([\\s\\S]*?)</a>`;
  const hasInvoiceLink = new RegExp(anchor, "i").test(html);
  if (!hasInvoiceLink) return { html, hasInvoiceLink };
  // The link alone in its paragraph, possibly wrapped in bold/italic/underline/span.
  const soleLink = new RegExp(
    `<p(?:\\s[^>]*)?>(?:\\s|<(?:strong|b|em|i|u|span)(?:\\s[^>]*)?>)*${anchor}(?:\\s|<br\\s*/?>|</(?:strong|b|em|i|u|span)>)*</p>`,
    "gi",
  );
  return {
    hasInvoiceLink,
    html: html.replace(
      soleLink,
      (_m, label: string) =>
        `<div style="text-align:center;margin:16px 0"><a href="${invoiceUrl}" style="${invoiceButtonStyle(brandColor)}">${label.replace(/<[^>]+>/g, "")}</a></div>`,
    ),
  };
}

/** The standard button appended under the body when the template has no invoice link. */
export function invoiceBottomButtonHtml(href: string, label: string, brandColor: string): string {
  return `<div style="padding:0 32px 28px;text-align:center"><a href="${href}" style="${invoiceButtonStyle(brandColor)}">${label}</a></div>`;
}
